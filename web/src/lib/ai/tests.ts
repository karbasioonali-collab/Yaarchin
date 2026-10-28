import "server-only";
// آزمون دستیار هوشمند: اجرای سؤال‌های آزمون از «همان مسیر چت» (جواب آماده، قاعده‌ی کد، داده‌های سایت، مدل، خواندن جواب، محافظ)
// بدون ساختن گفتگو، پیام یا برچسب. مستقل از سوئیچ دستیار؛ بدون کلید لیارا با مدل ساختگی و هزینه صفر.
// اجرا پشت‌سرهم در پس‌زمینه (after())، یکی‌یکی و با همان صف درخواست‌های مدل (limiter.ts)؛ سقف هزینه‌ی روزانه‌ی جدا
// (ai.test_daily_cost_toman). زمان‌بند اجرایی را که ضربان (heartbeat) ندارد «قطع‌شده» می‌کند. docs/infoyaarchin.md بخش ۳۳.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiRequests, aiTestCases, aiTestResults, aiTestRuns, products } from "@/db/schema";
import { AiCallError } from "./client";
import { aiConfig } from "./config";
import { buildContext } from "./context";
import { cannedReply } from "./canned";
import { type Decision, parseDecision } from "./decision";
import { checkOutput } from "./guard";
import { blacklistTerms } from "./guard-terms";
import { BusyError, withSlot } from "./limiter";
import { converse, HANDOFF_TEXT, modelHandoffReason, RESTRICTED_TEXT } from "./agent";
import { PROMPT_VERSION } from "./prompt";
import { extractQty, pleasantry, preRule } from "./rules";
import { allPass, DEFAULT_AVG_TOMAN, estimateRun, ruleCaught, runChecks, type TestExpect, type TestOutcome } from "./test-checks";
import { aiLimits, avgModelCost, testLimits, todayUsage } from "./usage";

// اجرایی که این مدت ضربان نداشته (سرور وسط کار ری‌استارت شد) ← interrupted
export const RUN_STALE_MS = 5 * 60_000;

export type ScopeKind = "all" | "normal" | "tricky" | "handoff" | "new" | "failed" | "selected";
export type Scope = { kind: ScopeKind; ids?: string[] };
export const SCOPE_FA: Record<ScopeKind, string> = {
  all: "همه",
  normal: "فقط معمولی",
  tricky: "فقط فریبنده",
  handoff: "فقط ارجاع",
  new: "فقط تازه یا ویرایش‌شده",
  failed: "فقط ردشده‌های آخرین اجرا",
  selected: "انتخاب دستی",
};
export type TestCase = typeof aiTestCases.$inferSelect;

export const testMode = (): "live" | "test" => aiConfig().mode;
const modelName = () => (testMode() === "live" ? aiConfig().model : "test/fake");

// زمان آخرین ویرایش واقعی سؤال (updated_at با «بررسی شد» هم عوض می‌شود؛ تاریخچه فقط با تغییر متن)
const editedAt = sql`coalesce((select max(v.created_at) from ai_test_case_versions v where v.case_id = ${aiTestCases.id}), ${aiTestCases.createdAt})`;
// آخرین نتیجه‌ی اجراشده‌ی هر سؤال
const lastResult = (col: string) => sql.raw(`(select r.${col} from ai_test_results r where r.case_id = ai_test_cases.id and r.status = 'done' order by r.id desc limit 1)`);

// سؤال‌های هر دامنه (همه‌ی دامنه‌ها فقط سؤال‌های فعال، جز «انتخاب دستی»)
export async function casesFor(scope: Scope): Promise<TestCase[]> {
  const active = eq(aiTestCases.status, "active");
  const order = [asc(aiTestCases.category), asc(aiTestCases.createdAt)] as const;
  switch (scope.kind) {
    case "all":
      return db
        .select()
        .from(aiTestCases)
        .where(active)
        .orderBy(...order);
    case "normal":
    case "tricky":
    case "handoff":
      return db
        .select()
        .from(aiTestCases)
        .where(and(active, eq(aiTestCases.category, scope.kind)))
        .orderBy(...order);
    case "new":
      return db
        .select()
        .from(aiTestCases)
        .where(and(active, sql`not exists (select 1 from ai_test_results r where r.case_id = ${aiTestCases.id} and r.status = 'done' and r.created_at >= ${editedAt})`))
        .orderBy(...order);
    case "failed":
      // ردشده = قضاوت انسان «اشتباه»، یا بدون قضاوت و بررسی خودکار رد
      return db
        .select()
        .from(aiTestCases)
        .where(and(active, sql`(${lastResult("verdict")} = 'wrong' or (${lastResult("verdict")} is null and ${lastResult("auto_pass")} = false))`))
        .orderBy(...order);
    case "selected": {
      const ids = (scope.ids ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
      if (!ids.length) return [];
      return db
        .select()
        .from(aiTestCases)
        .where(inArray(aiTestCases.id, ids))
        .orderBy(...order);
    }
  }
}

export type Estimate = ReturnType<typeof estimateRun> & { avgToman: number; avgFromData: boolean; live: boolean; capToman: number; usedToman: number; remainingToman: number };

export async function estimateFor(cases: TestCase[]): Promise<Estimate> {
  const live = testMode() === "live";
  const [limits, tl, avg, used] = await Promise.all([aiLimits(), testLimits(), avgModelCost(), todayUsage("test")]);
  const avgToman = avg ?? DEFAULT_AVG_TOMAN;
  const e = estimateRun(
    cases.map((c) => c.question),
    { bigOrderQty: limits.bigOrderQty, avgToman, live },
  );
  return {
    ...e,
    avgToman,
    avgFromData: avg !== null,
    live,
    capToman: tl.dailyCostToman,
    usedToman: used.costToman,
    remainingToman: Math.max(0, tl.dailyCostToman - used.costToman),
  };
}

export async function runningRun() {
  const [r] = await db
    .select()
    .from(aiTestRuns)
    .where(and(eq(aiTestRuns.status, "running"), sql`${aiTestRuns.heartbeatAt} > now() - make_interval(secs => ${RUN_STALE_MS / 1000})`))
    .limit(1);
  return r ?? null;
}

// ساختن اجرا و ردیف‌های «در انتظار»؛ خود اجرا را executeRun در after() انجام می‌دهد
export async function createRun(scope: Scope, by: string): Promise<{ id: string } | { error: string }> {
  if (await runningRun()) return { error: "یک آزمون دیگر در حال اجراست؛ صبر کنید یا آن را متوقف کنید." };
  const cases = await casesFor(scope);
  if (!cases.length) return { error: "سؤالی در این دامنه نیست." };
  const est = await estimateFor(cases);
  if (est.live && est.toman > est.remainingToman)
    return {
      error: `هزینه‌ی تخمینی (${est.toman.toLocaleString("fa-IR")} تومان) از باقی‌مانده‌ی سقف روزانه‌ی آزمون (${Math.round(est.remainingToman).toLocaleString("fa-IR")} تومان) بیشتر است؛ دامنه را کوچک‌تر کنید یا سقف را در صفحه‌ی دستیار بالا ببرید.`,
    };
  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(aiTestRuns)
      .values({
        mode: testMode(),
        scope: scope.kind === "selected" ? { kind: "selected", ids: cases.map((c) => c.id) } : { kind: scope.kind },
        model: modelName(),
        promptVersion: PROMPT_VERSION,
        total: cases.length,
        estimatedToman: String(est.toman),
        startedBy: by,
      })
      .returning({ id: aiTestRuns.id });
    await tx.insert(aiTestResults).values(
      cases.map((c, i) => ({
        runId: run.id,
        caseId: c.id,
        position: i,
        question: c.question,
        expectedAnswer: c.expectedAnswer,
        expect: c.expect,
        productSlug: c.productSlug,
      })),
    );
    return { id: run.id };
  });
}

type Evaluated = { outcome: TestOutcome; requestId: number | null; costToman: number; latencyMs: number };

// یک سؤال از همان مسیر چت (agent.ts)، بدون گفتگو و پیام
export async function evaluateQuestion(
  question: string,
  productSlug: string | null,
  ctx: { runId: string; caseId: string | null; bigOrderQty: number; blacklist: string[] },
): Promise<Evaluated> {
  const t0 = Date.now();
  const mode = testMode();
  const [p] = productSlug
    ? await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.slug, productSlug), eq(products.status, "published")))
    : [];
  const productId = p?.id ?? null;
  const done = (outcome: TestOutcome, requestId: number | null = null, costToman = 0): Evaluated => ({ outcome, requestId, costToman, latencyMs: Date.now() - t0 });

  const kind = pleasantry(question);
  if (kind) return done({ path: "canned", source: "canned", handoff: null, answer: await cannedReply(kind, productId), guardHits: [] });
  const pre = preRule(question, { bigOrderQty: ctx.bigOrderQty });
  if (pre) return done({ path: "rule", source: null, handoff: pre, answer: pre === "restricted" ? RESTRICTED_TEXT : HANDOFF_TEXT, guardHits: [] });

  const site = await buildContext(question, productId, extractQty(question));
  const rec = (status: string, outcome: string | null, extra: Partial<typeof aiRequests.$inferInsert>) =>
    db
      .insert(aiRequests)
      .values({
        purpose: "test_run",
        mode,
        status,
        outcome,
        latencyMs: Date.now() - t0,
        ...extra,
        meta: { promptVersion: PROMPT_VERSION, testRunId: ctx.runId, caseId: ctx.caseId, ...(extra.meta as object) },
      })
      .returning({ id: aiRequests.id })
      .then((x) => x[0].id);
  let out: Awaited<ReturnType<typeof converse>>;
  try {
    out = await withSlot(() => converse(mode, site, [], question));
  } catch (e) {
    const msg = e instanceof BusyError ? "صف دستیار پر بود" : (e as Error).message;
    const id = await rec(e instanceof AiCallError && e.kind === "timeout" ? "timeout" : "error", "error", { error: msg.slice(0, 500), model: modelName() });
    return done({ path: "error", source: null, handoff: "error", answer: msg, guardHits: [] }, id);
  }
  const decision: Decision | null = parseDecision(out.content);
  const base = {
    model: out.model,
    fallbackUsed: out.fallbackUsed,
    promptTokens: out.usage.promptTokens,
    completionTokens: out.usage.completionTokens,
    costToman: String(out.usage.costToman),
    meta: {
      cachedTokens: out.usage.cachedTokens ?? 0,
      products: site.products.map((p) => p.slug),
      ...(out.raws.length > 1 || !decision ? { retry: out.raws.length > 1 ? 1 : 0, raw: out.raws.map((r) => r.slice(0, 2000)) } : {}),
    },
  };
  const cost = out.usage.costToman;
  if (!decision) {
    const id = await rec("parse_error", "parse", base);
    return done({ path: "model", source: null, handoff: "parse", answer: out.content.slice(0, 2000), guardHits: [] }, id, cost);
  }
  const reason = modelHandoffReason(decision);
  if (reason) {
    const id = await rec("handoff", reason, base);
    const note = decision.handoff?.note ? `\n(یادداشت مدل برای کارشناس: ${decision.handoff.note})` : "";
    return done({ path: "model", source: null, handoff: reason, answer: (reason === "restricted" ? RESTRICTED_TEXT : HANDOFF_TEXT) + note, guardHits: [] }, id, cost);
  }
  const g = checkOutput(decision.answer, ctx.blacklist);
  if (!g.ok) {
    const hits = g.hits.map((h) => `${h.type}: ${h.match}`);
    const id = await rec("guard_block", "leak", { ...base, meta: { ...base.meta, hits: g.hits, blocked: decision.answer.slice(0, 2000) } });
    // جواب ردشده نمایش داده می‌شود تا انسان ببیند مدل چه می‌خواست بگوید
    return done({ path: "model", source: null, handoff: "leak", answer: decision.answer.trim().slice(0, 2000), guardHits: hits }, id, cost);
  }
  const id = await rec("ok", decision.source, base);
  return done({ path: "model", source: decision.source, handoff: null, answer: decision.answer.trim().slice(0, 2000), guardHits: [] }, id, cost);
}

const runState = (id: string) =>
  db
    .select({ stop: aiTestRuns.stopRequested, status: aiTestRuns.status })
    .from(aiTestRuns)
    .where(eq(aiTestRuns.id, id))
    .then((x) => x[0]);

async function skipRest(runId: string, path: "stop" | "cap" | "interrupted", onlyIds?: number[]) {
  const r = await db
    .update(aiTestResults)
    .set({ status: "skipped", path })
    .where(and(eq(aiTestResults.runId, runId), eq(aiTestResults.status, "pending"), onlyIds ? inArray(aiTestResults.id, onlyIds) : undefined))
    .returning({ id: aiTestResults.id });
  if (r.length)
    await db
      .update(aiTestRuns)
      .set({ skipped: sql`${aiTestRuns.skipped} + ${r.length}` })
      .where(eq(aiTestRuns.id, runId));
}

// اجرای پشت‌سرهم (در after() همان درخواستی که اجرا را ساخت)
export async function executeRun(runId: string): Promise<void> {
  const [limits, tl, blacklist] = await Promise.all([aiLimits(), testLimits(), blacklistTerms()]);
  const live = testMode() === "live";
  try {
    for (;;) {
      const st = await runState(runId);
      if (!st || st.status !== "running") return;
      if (st.stop) {
        await skipRest(runId, "stop");
        await db.update(aiTestRuns).set({ status: "stopped", finishedAt: new Date(), heartbeatAt: new Date() }).where(eq(aiTestRuns.id, runId));
        return;
      }
      const [next] = await db
        .select()
        .from(aiTestResults)
        .where(and(eq(aiTestResults.runId, runId), eq(aiTestResults.status, "pending")))
        .orderBy(asc(aiTestResults.position))
        .limit(1);
      if (!next) break;
      await db.update(aiTestRuns).set({ heartbeatAt: new Date() }).where(eq(aiTestRuns.id, runId));
      // سقف روزانه‌ی آزمون: سؤالی که به مدل می‌رود «رد شد (سقف)»؛ سؤال‌های قاعده‌ی کد (رایگان) ادامه می‌دهند
      if (live && !ruleCaught(next.question, limits.bigOrderQty) && (await todayUsage("test")).costToman >= tl.dailyCostToman) {
        await skipRest(runId, "cap", [next.id]);
        continue;
      }
      let ev: Evaluated;
      try {
        ev = await evaluateQuestion(next.question, next.productSlug, { runId, caseId: next.caseId, bigOrderQty: limits.bigOrderQty, blacklist });
      } catch (e) {
        ev = { outcome: { path: "error", source: null, handoff: "error", answer: (e as Error).message.slice(0, 500), guardHits: [] }, requestId: null, costToman: 0, latencyMs: 0 };
      }
      const checks = runChecks(next.expect as TestExpect, ev.outcome);
      const pass = allPass(checks);
      await db
        .update(aiTestResults)
        .set({
          status: "done",
          path: ev.outcome.path,
          answer: ev.outcome.answer,
          answerSource: ev.outcome.source,
          handoffReason: ev.outcome.handoff,
          autoPass: pass,
          checks,
          requestId: ev.requestId,
          costToman: String(ev.costToman),
          latencyMs: ev.latencyMs,
          createdAt: new Date(),
        })
        .where(eq(aiTestResults.id, next.id));
      await db
        .update(aiTestRuns)
        .set({
          done: sql`${aiTestRuns.done} + 1`,
          passed: sql`${aiTestRuns.passed} + ${pass ? 1 : 0}`,
          failed: sql`${aiTestRuns.failed} + ${pass ? 0 : 1}`,
          costToman: sql`${aiTestRuns.costToman} + ${ev.costToman}`,
          heartbeatAt: new Date(),
        })
        .where(eq(aiTestRuns.id, runId));
    }
    await db
      .update(aiTestRuns)
      .set({ status: "done", finishedAt: new Date(), heartbeatAt: new Date() })
      .where(and(eq(aiTestRuns.id, runId), eq(aiTestRuns.status, "running")));
  } catch (e) {
    console.error("ai test run failed", e);
    await skipRest(runId, "interrupted").catch(() => undefined);
    await db
      .update(aiTestRuns)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(aiTestRuns.id, runId))
      .catch(() => undefined);
  }
}

export async function requestStop(runId: string): Promise<boolean> {
  const r = await db
    .update(aiTestRuns)
    .set({ stopRequested: true })
    .where(and(eq(aiTestRuns.id, runId), eq(aiTestRuns.status, "running")))
    .returning({ id: aiTestRuns.id });
  return r.length > 0;
}

// زمان‌بند (هر دقیقه): اجرای بی‌ضربان ← interrupted و سؤال‌های باقی‌مانده «رد شد»
export async function sweepRuns(): Promise<number> {
  const stale = await db
    .update(aiTestRuns)
    .set({ status: "interrupted", finishedAt: new Date() })
    .where(and(eq(aiTestRuns.status, "running"), sql`${aiTestRuns.heartbeatAt} < now() - make_interval(secs => ${RUN_STALE_MS / 1000})`))
    .returning({ id: aiTestRuns.id });
  for (const r of stale) await skipRest(r.id, "interrupted");
  return stale.length;
}

// هشدار پنل برای دارندگان ai.tests: آزمون کامل این مدت اجرا نشده، یا آخرین آزمون کامل با مدل یا دستورالعمل دیگری بود
export async function staleWarning(): Promise<{ kind: "never" | "stale" | "changed"; days: number; last: Date | null } | null> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiTestCases)
    .where(eq(aiTestCases.status, "active"));
  if (!n) return null;
  const { staleDays } = await testLimits();
  const [last] = await db
    .select()
    .from(aiTestRuns)
    .where(and(eq(aiTestRuns.status, "done"), sql`${aiTestRuns.scope}->>'kind' = 'all'`))
    .orderBy(desc(aiTestRuns.startedAt))
    .limit(1);
  if (!last) return { kind: "never", days: staleDays, last: null };
  if (last.model !== modelName() || last.promptVersion !== PROMPT_VERSION) return { kind: "changed", days: staleDays, last: last.startedAt };
  if (Date.now() - last.startedAt.getTime() > staleDays * 86_400_000) return { kind: "stale", days: staleDays, last: last.startedAt };
  return null;
}
