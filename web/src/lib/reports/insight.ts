import "server-only";
// «تحلیل هوشمند» گزارش‌ها (بخش ۴۹). فقط با دکمه؛ نتیجه برای همان روز و همان بازه در ai_requests ذخیره می‌شود
// (purpose = report_insight؛ meta: day، rangeFrom/rangeTo، lines، dropped). بدون migration.
// محافظ‌ها روی هر خط: پاک‌کننده‌ی متن (clean-answer)، محافظ خروجی (اسم کارخانه، لینک، تلفن، لیست سیاه) و «عدد خارج از داده».
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiRequests } from "@/db/schema";
import { cleanAnswer } from "@/lib/ai/clean-answer";
import { AiCallError, chatCompletion } from "@/lib/ai/client";
import { aiConfig } from "@/lib/ai/config";
import { checkOutput } from "@/lib/ai/guard";
import { blacklistTerms } from "@/lib/ai/guard-terms";
import { BusyError, withSlot } from "@/lib/ai/limiter";
import { suspectNumbers } from "@/lib/ai/number-check";
import { todayUsage } from "@/lib/ai/usage";
import { aiReady, chatReady, followupReady, reportsReady } from "@/lib/db-ready";
import { autoInsightDue, autoInsightHour, autoInsightRange } from "@/lib/dashboard/core";
import { addDays, tehranRange, tehranYmd } from "@/lib/tehran-time";
import { scoreSource } from "@/lib/leads/score";
import { getSetting } from "@/lib/settings";
import { enoughData, INSIGHT_SYSTEM, type InsightData, insightInput, insightLines } from "./insight-core";
import { aiStats, chatNow, counts, topCategories, topProducts, type Win } from "./report";

const TIMEOUT = 30_000;
const MAX_TOKENS = 600;

export async function insightSettings(): Promise<{ enabled: boolean; capToman: number; auto: boolean }> {
  const [on, cap, auto] = await Promise.all([
    getSetting<boolean>("ai.report_insights").catch(() => null),
    getSetting<number>("ai.report_daily_cost_toman").catch(() => null),
    // اجرای خودکار روزانه (بخش ۵۱)؛ قبل از seed این PR ردیفش نیست ← خاموش
    getSetting<boolean>("ai.report_insights_auto").catch(() => null),
  ]);
  const n = Number(cap);
  return { enabled: on === true, capToman: Number.isFinite(n) && n >= 0 ? n : 5000, auto: auto === true };
}

export type SavedInsight = { at: Date; lines: string[]; dropped: { line: string; reason: string }[]; costToman: number; from: string; to: string };

// نتیجه‌ی امروز (روز تهران) برای همین بازه؛ null = هنوز اجرا نشده
export async function savedInsight(range: { from: string; to: string }): Promise<SavedInsight | null> {
  if (!(await aiReady())) return null;
  const r = await db.execute<{ created_at: Date; meta: Record<string, unknown>; cost_toman: string }>(sql`
    select created_at, meta, cost_toman from ai_requests
    where purpose = 'report_insight' and status = 'ok' and meta->>'day' = ${tehranYmd()} and meta->>'rangeFrom' = ${range.from} and meta->>'rangeTo' = ${range.to}
    order by id desc limit 1`);
  const x = r.rows[0];
  if (!x) return null;
  const m = x.meta as { lines?: string[]; dropped?: { line: string; reason: string }[] };
  return { at: new Date(x.created_at), lines: m.lines ?? [], dropped: m.dropped ?? [], costToman: Number(x.cost_toman), from: range.from, to: range.to };
}

// روزهای با فعالیت (بازدید یا ورود) در بازه
async function activeDays(w: Win): Promise<number> {
  const r = await db.execute<{ n: string }>(sql`
    select count(distinct (occurred_at at time zone 'Asia/Tehran')::date) as n from events
    where type in ('site_visit', 'product_view', 'category_view') and occurred_at >= ${w.start} and occurred_at < ${w.end}`);
  return Number(r.rows[0]?.n ?? 0);
}

export async function insightReadiness(w: Win, prev: Win) {
  const [c, days] = await Promise.all([counts(w), activeDays(w)]);
  return { enough: enoughData(c, days), activeDays: days, c, prev };
}

// گفتگو و درخواست مشتری هر محصول در بازه (برای «پربازدید با درخواست کم»)
async function productFollowups(w: Win, ids: string[]): Promise<Map<string, { chats: number; inquiries: number }>> {
  const out = new Map<string, { chats: number; inquiries: number }>();
  if (!ids.length || !(await chatReady())) return out;
  const fu = await followupReady();
  const r = await db.execute<{ id: string; chats: string; inquiries: string }>(sql`
    select c.product_id::text as id, count(distinct c.id) as chats,
      ${fu ? sql`count(distinct i.id)` : sql`0`} as inquiries
    from conversations c ${fu ? sql`left join inquiries i on i.conversation_id = c.id and i.created_at >= ${w.start} and i.created_at < ${w.end}` : sql``}
    where c.product_id::text in (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )}) and c.created_at >= ${w.start} and c.created_at < ${w.end}
    group by c.product_id`);
  for (const x of r.rows) out.set(x.id, { chats: Number(x.chats), inquiries: Number(x.inquiries) });
  return out;
}

async function leadSummary(): Promise<InsightData["leads"]> {
  if (!(await reportsReady())) return { above50: 0, top: null };
  const { sql: src } = await scoreSource();
  const r = await db.execute<{ above: string; top: string | null }>(
    sql`select count(*) filter (where s.score >= 50) as above, max(s.score) as top from ${src} s where s.score > 0`,
  );
  return { above50: Number(r.rows[0]?.above ?? 0), top: r.rows[0]?.top === null || r.rows[0]?.top === undefined ? null : Math.round(Number(r.rows[0].top)) };
}

async function buildData(range: { from: string; to: string; days: number }, w: Win, prev: Win): Promise<InsightData> {
  const [cur, pre, prods, cats, chat, ai, leads] = await Promise.all([counts(w), counts(prev), topProducts(w, 8), topCategories(w, 5), chatNow(), aiStats(w), leadSummary()]);
  const fu = await productFollowups(
    w,
    prods.map((p) => p.id),
  );
  return {
    range,
    cur,
    prev: pre,
    topProducts: prods.map((p) => ({ title: p.title, views: p.views, visitors: p.visitors, chats: fu.get(p.id)?.chats ?? 0, inquiries: fu.get(p.id)?.inquiries ?? 0 })),
    topCategories: cats.map((x) => ({ name: x.name, views: x.views, visitors: x.visitors })),
    chat: { unanswered: chat.unansweredCount, unassignedOpen: chat.unassigned },
    leads,
    ai,
  };
}

export type RunResult = { ok: true } | { ok: false; error: string };

// اجرا با دکمه‌ی «تحلیل کن». سوئیچ، داده‌ی کافی و سقف هزینه‌ی روزانه قبل از هر درخواست به مدل.
export async function runInsight(range: { from: string; to: string; days: number }, w: Win, prev: Win, opts: { auto?: boolean } = {}): Promise<RunResult> {
  if (!(await aiReady())) return { ok: false, error: "این بخش بعد از اجرای migration ۰۰۱۰ فعال می‌شود." };
  const st = await insightSettings();
  if (!st.enabled) return { ok: false, error: "تحلیل هوشمند گزارش خاموش است (صفحه‌ی «دستیار هوشمند»)." };
  const cfg = aiConfig();
  if (cfg.mode !== "live") return { ok: false, error: "کلید هوش مصنوعی لیارا تعریف نشده است (حالت آزمایشی)؛ تحلیل اجرا نمی‌شود." };
  const ready = await insightReadiness(w, prev);
  if (!ready.enough) return { ok: false, error: "داده‌ی کافی برای تحلیل نیست." };
  if ((await todayUsage("report")).costToman >= st.capToman) return { ok: false, error: "سقف هزینه‌ی روزانه‌ی تحلیل هوشمند پر شده است؛ فردا دوباره امتحان کنید." };

  const data = await buildData(range, w, prev);
  const input = insightInput(data);
  const t0 = Date.now();
  const base = { purpose: "report_insight", mode: "live" as const };
  const meta = { day: tehranYmd(), rangeFrom: range.from, rangeTo: range.to, ...(opts.auto ? { auto: true } : {}) };
  let reply;
  let model = cfg.model;
  try {
    const ask = (m: string) =>
      chatCompletion(
        cfg,
        m,
        {
          messages: [
            { role: "system", content: INSIGHT_SYSTEM },
            { role: "user", content: `DATA:\n${input}` },
          ],
          maxTokens: MAX_TOKENS,
        },
        TIMEOUT,
      );
    reply = await withSlot(async () => {
      try {
        return await ask(cfg.model);
      } catch (e) {
        if (!cfg.fallbackModel) throw e;
        model = cfg.fallbackModel;
        return ask(cfg.fallbackModel);
      }
    });
  } catch (e) {
    const msg = e instanceof BusyError ? "صف دستیار پر بود" : (e as Error).message;
    await db.insert(aiRequests).values({
      ...base,
      status: e instanceof AiCallError && e.kind === "timeout" ? "timeout" : "error",
      error: msg.slice(0, 500),
      model,
      latencyMs: Date.now() - t0,
      meta,
    });
    return { ok: false, error: `تحلیل انجام نشد: ${msg}` };
  }

  // هر خط جدا از محافظ‌ها رد می‌شود؛ خط مشکوک حذف و ثبت می‌شود (نه کل جواب)
  const blacklist = await blacklistTerms();
  const lines: string[] = [];
  const dropped: { line: string; reason: string }[] = [];
  for (const raw of insightLines(reply.content ?? "")) {
    const cl = cleanAnswer(raw);
    const line = cl.text.trim();
    if (!line || cl.tooShort) {
      dropped.push({ line: raw.slice(0, 300), reason: "internal" });
      continue;
    }
    const g = checkOutput(line, blacklist);
    if (!g.ok) {
      dropped.push({ line: line.slice(0, 300), reason: `guard: ${g.hits.map((h) => h.type).join(",")}` });
      continue;
    }
    const sus = suspectNumbers(line, [input]);
    if (sus.length) {
      dropped.push({ line: line.slice(0, 300), reason: `numbers: ${sus.join("، ")}` });
      continue;
    }
    lines.push(line);
  }
  const truncated = reply.finishReason === "length";
  await db.insert(aiRequests).values({
    ...base,
    status: lines.length ? "ok" : "guard_block",
    outcome: lines.length ? "report_insight" : "no_lines",
    model: reply.model || model,
    fallbackUsed: model === cfg.model ? 0 : 1,
    promptTokens: reply.usage.promptTokens,
    completionTokens: reply.usage.completionTokens,
    costToman: String(reply.usage.costToman),
    latencyMs: Date.now() - t0,
    meta: { ...meta, lines, dropped, raw: [(reply.content ?? "").slice(0, 3000)], input: input.slice(0, 6000), ...(truncated ? { truncated: true } : {}) },
  });
  if (!lines.length) return { ok: false, error: "تحلیل قابل اعتماد نبود (همه‌ی پیشنهادها از محافظ رد شدند)؛ جزئیات در «آخرین درخواست‌ها»." };
  return { ok: true };
}

// ---------- اجرای خودکار روزانه (بخش ۵۱؛ تصمیم مالک) ----------
// از زمان‌بند ۶۰ ثانیه‌ای (lib/chat/scheduler.ts) با قفل دیتابیس جدا. شرط‌ها:
//   سوئیچ ai.report_insights و ai.report_insights_auto هر دو روشن؛ ساعت تهران ≥ AUTO_INSIGHT_HOUR (پیش‌فرض ۶)؛
//   امروز هنوز اجرای خودکاری ثبت نشده (meta.auto، هر وضعیتی: ناموفق هم همان روز تکرار نمی‌شود تا هزینه تکرار نشود).
// بازه: «۷ روز تا پایان دیروز». بقیه‌ی شرط‌ها (حالت زنده، داده‌ی کافی، سقف) همان runInsight است. اگر یکی از آن‌ها نبود،
// ردیفی ثبت نمی‌شود؛ برای اینکه هر دقیقه دوباره شمارش نشود، همان روز در حافظه‌ی پروسه علامت می‌خورد.
let autoCheckedDay: string | null = null;
export async function runAutoInsight(now: Date = new Date()): Promise<"off" | "early" | "done-today" | "skipped" | "ran"> {
  if (!(await aiReady())) return "off";
  const st = await insightSettings();
  if (!st.enabled || !st.auto) return "off";
  if (!autoInsightDue(now, autoInsightHour(process.env.AUTO_INSIGHT_HOUR))) return "early";
  const day = tehranYmd(now);
  if (autoCheckedDay === day) return "done-today";
  const r = await db.execute(sql`select 1 from ai_requests where purpose = 'report_insight' and meta->>'auto' = 'true' and meta->>'day' = ${day} limit 1`);
  if (r.rows.length) {
    autoCheckedDay = day;
    return "done-today";
  }
  const range = autoInsightRange(now);
  const cur = tehranRange(range.from, range.to);
  const prev = tehranRange(addDays(range.from, -7), addDays(range.from, -1));
  autoCheckedDay = day;
  const res = await runInsight(range, cur, prev, { auto: true });
  return res.ok ? "ran" : "skipped";
}

// نتیجه‌ی اجرای خودکار امروز برای داشبورد (هر وضعیتی، تا «ناموفق بود» هم دیده شود)
export async function autoInsightToday(): Promise<{ status: string; at: Date; lines: string[]; dropped: number; costToman: number; from: string; to: string } | null> {
  if (!(await aiReady())) return null;
  const r = await db.execute<{ status: string; created_at: Date; meta: Record<string, unknown>; cost_toman: string }>(sql`
    select status, created_at, meta, cost_toman from ai_requests
    where purpose = 'report_insight' and meta->>'auto' = 'true' and meta->>'day' = ${tehranYmd()} order by id desc limit 1`);
  const x = r.rows[0];
  if (!x) return null;
  const m = x.meta as { lines?: string[]; dropped?: unknown[]; rangeFrom?: string; rangeTo?: string };
  return {
    status: x.status,
    at: new Date(x.created_at),
    lines: m.lines ?? [],
    dropped: m.dropped?.length ?? 0,
    costToman: Number(x.cost_toman),
    from: m.rangeFrom ?? "",
    to: m.rangeTo ?? "",
  };
}
