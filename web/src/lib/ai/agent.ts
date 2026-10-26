import "server-only";
// ایجنت «دستیار هوشمند یارچین» در چت مشتری. docs/infoyaarchin.md بخش ۲۹.
// مسیر هر پیام مشتری (onCustomerMessage ← بعد از پاسخ به مشتری، runAgent در after()):
//   ۱. سوئیچ و وضعیت گفتگو (فقط گفتگوهای تازه از وقتی دستیار روشن است؛ ساکت بعد از پیام کارشناس یا ارجاع)
//   ۲. سقف‌ها: جواب‌های این گفتگو، پیام‌های ۲۴ ساعت مشتری، درخواست و هزینه‌ی روزانه‌ی کل
//   ۳. قاعده‌های قطعی (rules.ts): پیش‌فاکتور، تخفیف، قیمت قطعی، شکایت، کارشناس، سفارش بزرگ، کارخانه/سایت خرید؛ امتیاز جدیت بالا
//   ۴. داده‌های سایت (context.ts) ← مدل (یا مدل ساختگی) با ابزار landed_cost ← JSON {answer, source, handoff}
//   ۵. محافظ خروجی (guard.ts) ← نمایش، یا جایگزینی و ارجاع
// حالت آزمایشی: همه‌ی این‌ها اجرا می‌شود ولی جواب و پیام ارجاع فقط داخلی است (مشتری نمی‌بیند) و گفتگو مثل قبل به صف کارشناس می‌رود.
import { and, desc, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db/client";
import { aiRequests, chatMessages, conversationFlags, conversations, users } from "@/db/schema";
import { alertNewChat } from "@/lib/chat/alerts";
import type { CustomerPostResult } from "@/lib/chat/service";
import { reportsReady } from "@/lib/db-ready";
import { scoresFor } from "@/lib/leads/score";
import { absoluteUrl, siteUrl } from "@/lib/site/url";
import { addUsage, AiCallError, chatCompletion, type ChatMsg, type ModelReply, type Usage, ZERO_USAGE } from "./client";
import { aiConfig } from "./config";
import { buildContext, contextText, historyOf, runLandedTool, type SiteContext } from "./context";
import { fakeModel } from "./fake";
import { checkOutput, GUARD_REPLACEMENT } from "./guard";
import { blacklistTerms } from "./guard-terms";
import { BusyError, withSlot } from "./limiter";
import { type Decision, parseDecision } from "./decision";
import { normFa } from "./normalize";
import { LANDED_TOOL, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";
import { HANDOFF_FA, preRule } from "./rules";
import { addReply, aiStatus, ensureState, getState, resume, setThinking, silence } from "./state";
import { aiLimits, customerMessages24h, todayUsage } from "./usage";

const PRIMARY_TIMEOUT = 25_000;
const FALLBACK_TIMEOUT = 20_000;
export const STUCK_AFTER_MS = 90_000;
const MAX_TOOL_ROUNDS = 2;

export const HANDOFF_TEXT = "پیام شما به کارشناس یارچین سپرده شد؛ به‌زودی همین‌جا پاسخ می‌دهد.";
export const RESTRICTED_TEXT = "این بخش از خدمات یارچین است و کارشناس یارچین در همین گفتگو کمکتان می‌کند.";

type Mode = "live" | "test";
type RunCtx = { conversationId: string; messageId: number; mode: Mode; link: string | null };

// ---------- ورودی از API مشتری ----------
// خروجی handled = دستیار زنده این پیام را جواب می‌دهد (پس هشدار پیامکی «گفتگوی تازه» حالا لازم نیست؛ با ارجاع فرستاده می‌شود).
export async function onCustomerMessage(r: CustomerPostResult): Promise<{ handled: boolean }> {
  const status = await aiStatus();
  if (status === "off") return { handled: false };
  const conv = r.conversation;
  let state = await getState(conv.id);
  const firstMessage = r.queued && !r.reopened;
  if (!state) {
    // فقط گفتگویی که از وقتی دستیار روشن است شروع شده؛ گفتگوهای قدیمی مثل قبل با کارشناس
    if (!firstMessage) return { handled: false };
    state = await ensureState(conv.id);
  }
  if (conv.assignedTo) {
    if (state.mode === "ai") await silence(conv.id, "assigned", null);
    return { handled: false };
  }
  if (state.mode === "human" && r.reopened) {
    const hours = (await aiLimits()).resumeAfterHours;
    if (state.silencedAt && Date.now() - state.silencedAt.getTime() >= hours * 3_600_000) {
      await resume(conv.id);
      state = (await getState(conv.id))!;
    }
  }
  if (state.mode !== "ai") return { handled: false };
  const link = await absoluteUrl(`/admin/chats/${conv.id}`);
  const ctx: RunCtx = { conversationId: conv.id, messageId: r.message.id, mode: status, link };
  if (status === "live") await setThinking(conv.id, true);
  after(async () => {
    try {
      await runAgent(ctx);
    } catch (e) {
      console.error("ai agent failed", e);
      await handoff(ctx, "error", (e as Error).message).catch(() => undefined);
    }
  });
  return { handled: status === "live" };
}

// ---------- اجرا ----------

export async function runAgent(c: RunCtx): Promise<void> {
  const t0 = Date.now();
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, c.conversationId));
  const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, c.messageId));
  const state = await getState(c.conversationId);
  if (!conv || !msg || !state || state.mode !== "ai" || conv.assignedTo) return void (await setThinking(c.conversationId, false));
  // سوئیچ همان لحظه: اگر وسط کار خاموش شد، کاری نکن
  const status = await aiStatus();
  if (status === "off") return void (await setThinking(c.conversationId, false));

  const limits = await aiLimits();
  const rec = (status2: string, outcome: string | null, extra: Partial<typeof aiRequests.$inferInsert> = {}) =>
    db
      .insert(aiRequests)
      .values({ purpose: "chat", mode: c.mode, conversationId: c.conversationId, messageId: c.messageId, status: status2, outcome, latencyMs: Date.now() - t0, ...extra })
      .returning({ id: aiRequests.id })
      .then((x) => x[0].id);

  // سقف‌ها
  if (state.replies >= limits.maxRepliesPerChat) return handoff(c, "long_chat", null, await rec("handoff", "long_chat"));
  if ((await customerMessages24h(conv.customerId)) >= limits.customerDailyMessages) return handoff(c, "customer_cap", null, await rec("handoff", "customer_cap"));
  if (c.mode === "live") {
    const u = await todayUsage();
    if (u.requests >= limits.dailyRequests || u.costToman >= limits.dailyCostToman) return handoff(c, "global_cap", null, await rec("handoff", "global_cap"));
  }

  // قاعده‌های قطعی
  await flagRepeated(c, conv.id, msg.body);
  const pre = preRule(msg.body, { bigOrderQty: limits.bigOrderQty });
  if (pre === "restricted") {
    const reqId = await rec("handoff", "restricted");
    await postAi(c, RESTRICTED_TEXT, { source: "rule", requestId: reqId });
    return handoff(c, "restricted", null, reqId, { silentMessage: true });
  }
  if (pre) return handoff(c, pre, null, await rec("handoff", pre));
  if (await reportsReady()) {
    const score = (await scoresFor([conv.customerId])).get(conv.customerId) ?? 0;
    if (score >= limits.leadScoreHandoff) return handoff(c, "lead_score", `امتیاز ${score}`, await rec("handoff", "lead_score"));
  }

  // مدل
  const site = await buildContext(msg.body, conv.productId);
  let usage: Usage = ZERO_USAGE;
  let modelUsed: string | null = null;
  let fallbackUsed = 0;
  let decision: Decision | null = null;
  try {
    const out = await withSlot(() => converse(c.mode, site, conv.id, msg.id, msg.body));
    usage = out.usage;
    modelUsed = out.model;
    fallbackUsed = out.fallbackUsed;
    decision = parseDecision(out.content);
  } catch (e) {
    const kind = e instanceof BusyError ? "busy" : "error";
    const reqId = await rec(e instanceof AiCallError && e.kind === "timeout" ? "timeout" : "error", kind, {
      error: (e as Error).message.slice(0, 500),
      model: e instanceof AiCallError ? (c.mode === "live" ? aiConfig().model : "test/fake") : null,
    });
    return handoff(c, kind, (e as Error).message, reqId);
  }
  const base = {
    model: modelUsed,
    fallbackUsed,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    costToman: String(usage.costToman),
    meta: { promptVersion: PROMPT_VERSION, kb: site.kb.map((k) => k.id), products: site.products.map((p) => p.slug) },
  };
  if (!decision) return handoff(c, "parse", null, await rec("parse_error", "parse", base));
  if (decision.handoff || decision.source === "none" || !decision.answer.trim()) {
    const reason = decision.handoff?.reason && HANDOFF_FA[decision.handoff.reason] ? decision.handoff.reason : decision.source === "none" ? "no_source" : "model";
    const reqId = await rec("handoff", reason, base);
    if (reason === "restricted") {
      await postAi(c, RESTRICTED_TEXT, { source: "rule", requestId: reqId });
      return handoff(c, reason, decision.handoff?.note ?? null, reqId, { silentMessage: true });
    }
    return handoff(c, reason, decision.handoff?.note ?? null, reqId);
  }
  const g = checkOutput(decision.answer, await blacklistTerms());
  if (!g.ok) {
    const reqId = await rec("guard_block", "leak", { ...base, meta: { ...base.meta, hits: g.hits, blocked: decision.answer.slice(0, 2000) } });
    return handoff(c, "leak", g.hits.map((h) => `${h.type}: ${h.match}`).join("، "), reqId, { replacement: true });
  }
  const reqId = await rec("ok", decision.source, base);
  const m = await postAi(c, decision.answer.trim().slice(0, 2000), { source: decision.source, requestId: reqId });
  await db.update(aiRequests).set({ replyMessageId: m.id }).where(eq(aiRequests.id, reqId));
  await addReply(c.conversationId);
}

// گفتگو با مدل (یا مدل ساختگی) با حداکثر دو دور ابزار ماشین‌حساب؛ اگر مدل اصلی خطا داد یا جواب نداد، یک بار مدل پشتیبان.
async function converse(mode: Mode, site: SiteContext, conversationId: string, messageId: number, text: string) {
  const history = await historyOf(conversationId, messageId);
  const prior = history.slice(0, -1);
  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...prior,
    { role: "user", content: `داده‌های سایت (تنها منبع مجاز):\n${contextText(site)}\n---\n${text}` },
  ];
  const cfg = aiConfig();
  const call = async (which: "primary" | "fallback", msgs: ChatMsg[], tools: boolean): Promise<ModelReply> => {
    if (mode === "test") return fakeModel(which, msgs, site);
    const model = which === "primary" ? cfg.model : cfg.fallbackModel!;
    return chatCompletion(cfg, model, { messages: msgs, ...(tools ? { tools: [LANDED_TOOL] } : {}), maxTokens: 700 }, which === "primary" ? PRIMARY_TIMEOUT : FALLBACK_TIMEOUT);
  };
  const run = async (which: "primary" | "fallback") => {
    const msgs = [...messages];
    let usage: Usage = ZERO_USAGE;
    let useTools = true;
    for (let round = 0; ; round++) {
      let r: ModelReply;
      try {
        r = await call(which, msgs, useTools);
      } catch (e) {
        // اگر ارائه‌دهنده ابزار را نپذیرفت (خطای ۴۰۰ درباره‌ی tools)، یک بار بدون ابزار
        if (useTools && e instanceof AiCallError && e.kind === "http" && e.status === 400 && /tool/i.test(e.body ?? "")) {
          useTools = false;
          continue;
        }
        throw e;
      }
      usage = addUsage(usage, r.usage);
      if (r.toolCalls.length && round < MAX_TOOL_ROUNDS) {
        msgs.push({ role: "assistant", content: r.content ?? null, tool_calls: r.toolCalls });
        for (const tc of r.toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {}
          const result = tc.function.name === "landed_cost" ? await runLandedTool(args) : { error: "unknown_tool" };
          msgs.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue;
      }
      return { content: r.content ?? "", usage, model: r.model };
    }
  };
  try {
    return { ...(await run("primary")), fallbackUsed: 0 };
  } catch (e) {
    const hasFallback = mode === "test" || !!cfg.fallbackModel;
    if (!hasFallback) throw e;
    console.warn("ai primary model failed, trying fallback:", (e as Error).message);
    return { ...(await run("fallback")), fallbackUsed: 1 };
  }
}

// ---------- نوشتن ----------
async function postAi(c: RunCtx, body: string, meta: Record<string, unknown>) {
  const test = c.mode === "test";
  const [m] = await db
    .insert(chatMessages)
    .values({
      conversationId: c.conversationId,
      senderType: "ai",
      body: test ? `[آزمایشی — مشتری نمی‌بیند] ${body}` : body,
      visibleToCustomer: !test,
      meta: { ...meta, ...(test ? { test: true } : {}) },
    })
    .returning();
  if (!test) await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, c.conversationId));
  return m;
}

// ارجاع به کارشناس: دستیار ساکت می‌شود، برچسب با دلیل، پیام به مشتری (در حالت زنده) و هشدار پیامکی مثل گفتگوی تازه.
// ارجاع به کارشناس خاص همیشه دستی است؛ گفتگو در صف «ارجاع‌نشده» می‌ماند.
export async function handoff(c: RunCtx, reason: string, note: string | null, requestId?: number, opts: { replacement?: boolean; silentMessage?: boolean } = {}): Promise<void> {
  const test = c.mode === "test";
  const label = HANDOFF_FA[reason] ?? reason;
  await silence(c.conversationId, `handoff:${reason}`, null);
  if (!opts.silentMessage) await postAi(c, opts.replacement ? GUARD_REPLACEMENT : HANDOFF_TEXT, { source: "handoff", reason, requestId });
  await db.insert(chatMessages).values({
    conversationId: c.conversationId,
    senderType: "system",
    kind: "event",
    body: `${test ? "[آزمایشی] " : ""}دستیار گفتگو را به کارشناس سپرد: ${label}${note ? ` (${note.slice(0, 200)})` : ""}`,
    visibleToCustomer: false,
    meta: { event: "ai_handoff", reason, test, requestId },
  });
  await db.insert(conversationFlags).values({
    conversationId: c.conversationId,
    flag: reason === "leak" || reason === "parse" ? "needs_review" : "needs_expert",
    reason: `${test ? "آزمایشی: " : ""}${label}`,
    source: "ai",
  });
  if (!test) {
    const [conv] = await db
      .select({ name: users.fullName, subject: conversations.subject, assignedTo: conversations.assignedTo })
      .from(conversations)
      .innerJoin(users, eq(users.id, conversations.customerId))
      .where(eq(conversations.id, c.conversationId));
    if (conv && !conv.assignedTo)
      await alertNewChat({ conversationId: c.conversationId, customerName: conv.name, topic: conv.subject, link: c.link }).catch((e) => console.error("handoff alert failed", e));
  }
}

// سؤال تکراری: همان متن (یکسان‌شده) در ۳ پیام قبلی مشتری ← برچسب «نیاز به بررسی» (یک بار تا حل شود)
async function flagRepeated(c: RunCtx, conversationId: string, body: string) {
  const prev = await db
    .select({ body: chatMessages.body })
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.senderType, "customer"), sql`${chatMessages.id} < ${c.messageId}`))
    .orderBy(desc(chatMessages.id))
    .limit(3);
  const n = normFa(body);
  if (!prev.some((p) => normFa(p.body) === n)) return;
  const [open] = await db
    .select({ id: conversationFlags.id })
    .from(conversationFlags)
    .where(and(eq(conversationFlags.conversationId, conversationId), sql`${conversationFlags.resolvedAt} is null`, sql`${conversationFlags.reason} like '%تکرار سؤال%'`));
  if (!open) await db.insert(conversationFlags).values({ conversationId, flag: "needs_review", reason: `${c.mode === "test" ? "آزمایشی: " : ""}تکرار سؤال`, source: "ai" });
}

// زمان‌بند (هر دقیقه): گفتگویی که دستیار بیش از ۹۰ ثانیه «در حال نوشتن» مانده (مثلاً برنامه وسط کار ری‌استارت شد) ← کارشناس
export async function sweepStuck(): Promise<number> {
  const r = await db.execute<{ conversation_id: string }>(sql`
    select conversation_id from ai_conversation_state where mode = 'ai' and thinking_since < now() - make_interval(secs => ${STUCK_AFTER_MS / 1000}) limit 20`);
  const base = siteUrl();
  for (const x of r.rows) {
    await handoff({ conversationId: x.conversation_id, messageId: 0, mode: aiConfig().mode, link: base ? `${base}/admin/chats/${x.conversation_id}` : null }, "stuck", null);
  }
  return r.rows.length;
}
