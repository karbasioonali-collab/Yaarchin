import "server-only";
// «متن فارسی محصول با AI» (PR ۴ب؛ migration ۰۰۱۴): آماده کردن ورودی، تخمین هزینه، اجرا، محافظ و ذخیره‌ی پیش‌نویس. docs/infoyaarchin.md بخش ۴۰.
// به سوئیچ دستیار چت وابسته نیست؛ فقط کلید AI (حالت زنده) یا حالت آزمایشی. سقف جدا: ai.catalog_daily_cost_toman.
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiRequests, productListings, productTextDrafts } from "@/db/schema";
import { AiCallError, chatCompletion, type ModelReply } from "@/lib/ai/client";
import { aiConfig, catalogModel } from "@/lib/ai/config";
import { blacklistTerms } from "@/lib/ai/guard-terms";
import { DEFAULT_AVG_TOMAN } from "@/lib/ai/test-checks";
import { catalogLimits, todayUsage } from "@/lib/ai/usage";
import {
  buildDraftInput,
  checkDraft,
  DRAFT_PROMPT,
  type DraftHit,
  type DraftInput,
  type DraftOutput,
  draftUserMessage,
  estimateTokens,
  fakeDraft,
  parseDraft,
} from "./text-draft-core";

export type Prepared = {
  input: DraftInput;
  live: boolean;
  model: string;
  tokens: { prompt: number; completion: number };
  estimateToman: number;
  capToman: number;
  usedToman: number;
  remainingToman: number;
};

export async function draftInputFor(productId: string): Promise<DraftInput> {
  const ls = await db
    .select({ titleEn: productListings.titleEn, specs: productListings.specs })
    .from(productListings)
    .where(and(eq(productListings.productId, productId), eq(productListings.status, "active")));
  return buildDraftInput(ls, await blacklistTerms());
}

// قیمت هر توکن از ۵۰ درخواست زنده‌ی اخیر (هزینه‌ی واقعی لیارا ÷ توکن‌ها)؛ تا داده نیست، از میانگین پیش‌فرض یک جواب دستیار
async function tomanPerToken(): Promise<number> {
  const r = await db.execute<{ c: string | null; t: string | null }>(sql`
    select sum(cost_toman) as c, sum(prompt_tokens + completion_tokens) as t from (
      select cost_toman, prompt_tokens, completion_tokens from ai_requests
      where mode = 'live' and model is not null and cost_toman > 0 and prompt_tokens + completion_tokens > 0 order by id desc limit 50) x`);
  const c = Number(r.rows[0]?.c ?? 0);
  const t = Number(r.rows[0]?.t ?? 0);
  return c > 0 && t > 0 ? c / t : DEFAULT_AVG_TOMAN / 1100;
}

export async function prepareDraft(productId: string): Promise<Prepared> {
  const cfg = aiConfig();
  const live = cfg.mode === "live";
  const [input, limits, used, perToken] = await Promise.all([draftInputFor(productId), catalogLimits(), todayUsage("catalog"), tomanPerToken()]);
  const tokens = estimateTokens(input);
  const nothing = !input.titles.length && !input.highlights.length && !input.specs.length;
  return {
    input,
    live,
    model: catalogModel(cfg).model,
    tokens,
    estimateToman: live && !nothing ? Math.ceil((tokens.prompt + tokens.completion) * perToken) : 0,
    capToman: limits.dailyCostToman,
    usedToman: used.costToman,
    remainingToman: Math.max(0, limits.dailyCostToman - used.costToman),
  };
}

export type DraftResult = { id: string; status: "ready" | "blocked" | "error"; hits: DraftHit[]; error?: string } | { refused: string };

export async function runDraft(productId: string, by: string): Promise<DraftResult> {
  const p = await prepareDraft(productId);
  if (!p.input.titles.length && !p.input.highlights.length && !p.input.specs.length && !p.input.localSpecs.length)
    return { refused: "این محصول لیستینگی با اسم، ویژگی یا مشخصات ندارد؛ چیزی برای نوشتن نیست." };
  const cfg = aiConfig();
  const blacklist = await blacklistTerms();

  // حالت آزمایشی: فقط واژه‌نامه، هزینه صفر
  if (!p.live) {
    const out = fakeDraft(p.input);
    const [req] = await db
      .insert(aiRequests)
      .values({ purpose: "catalog_text", mode: "test", status: "ok", outcome: "catalog_text", meta: { productId } })
      .returning({ id: aiRequests.id });
    const [d] = await db
      .insert(productTextDrafts)
      .values({ productId, status: "ready", input: p.input, output: out, aiRequestId: req.id, createdBy: by })
      .returning({ id: productTextDrafts.id });
    return { id: d.id, status: "ready", hits: [] };
  }

  if (p.estimateToman > p.remainingToman)
    return {
      refused: `هزینه‌ی تخمینی (${p.estimateToman.toLocaleString("fa-IR")} تومان) از باقی‌مانده‌ی سقف روزانه (${Math.round(p.remainingToman).toLocaleString("fa-IR")} تومان) بیشتر است؛ سقف را در صفحه‌ی دستیار بالا ببرید یا فردا امتحان کنید.`,
    };

  const { model, fallbackModel } = catalogModel(cfg);
  const messages = [
    { role: "system" as const, content: DRAFT_PROMPT },
    { role: "user" as const, content: draftUserMessage(p.input) },
  ];
  const t0 = Date.now();
  let reply: ModelReply | null = null;
  // مدل اصلی، و اگر خطا داد یک بار مدل پشتیبان (مثل دستیار)
  let fallbackUsed = 0;
  let err: string | null = null;
  const models = [model, ...(fallbackModel ? [fallbackModel] : [])];
  for (const [i, m] of models.entries()) {
    try {
      reply = await chatCompletion(cfg, m, { messages, maxTokens: 1800, temperature: 0.3 }, 60_000);
      fallbackUsed = i;
      break;
    } catch (e) {
      err = e instanceof AiCallError ? e.message : (e as Error).message;
      fallbackUsed = i;
    }
  }
  const out = reply ? parseDraft(reply.content ?? "") : null;
  // مشخصاتِ واژه‌نامه همیشه می‌آیند؛ ترجمه‌ی AI برای بقیه (هم‌عنوان‌ها یک بار)
  const merged: DraftOutput | null = out ? { ...out, specs: dedupeSpecs([...fakeDraft(p.input).specs, ...out.specs]) } : null;
  const hits = merged ? checkDraft(merged, p.input, blacklist) : [];
  const status: "ready" | "blocked" | "error" = !reply || !merged ? "error" : hits.length ? "blocked" : "ready";
  const cost = reply?.usage.costToman ?? 0;
  const [req] = await db
    .insert(aiRequests)
    .values({
      purpose: "catalog_text",
      mode: "live",
      model: reply?.model ?? model,
      fallbackUsed,
      status: status === "ready" ? "ok" : status === "blocked" ? "guard_block" : reply ? "parse_error" : "error",
      outcome: "catalog_text",
      promptTokens: reply?.usage.promptTokens ?? 0,
      completionTokens: reply?.usage.completionTokens ?? 0,
      costToman: String(cost),
      latencyMs: Date.now() - t0,
      error: reply ? (merged ? null : "قالب JSON نادرست") : (err ?? "بدون جواب").slice(0, 500),
      meta: { productId, hits },
    })
    .returning({ id: aiRequests.id });
  const [d] = await db
    .insert(productTextDrafts)
    .values({
      productId,
      status,
      input: p.input,
      output: merged ?? (reply ? { raw: (reply.content ?? "").slice(0, 2000) } : null),
      guardHits: hits,
      aiRequestId: req.id,
      costToman: String(cost),
      model: reply?.model ?? model,
      createdBy: by,
    })
    .returning({ id: productTextDrafts.id });
  return { id: d.id, status, hits, ...(status === "error" ? { error: reply ? "جواب مدل قالب درستی نداشت." : `مدل جواب نداد: ${err}` } : {}) };
}

function dedupeSpecs<T extends { labelFa: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((s) => (seen.has(s.labelFa) ? false : (seen.add(s.labelFa), true)));
}

export async function draftsOf(productId: string, limit = 5) {
  return db.select().from(productTextDrafts).where(eq(productTextDrafts.productId, productId)).orderBy(desc(productTextDrafts.createdAt)).limit(limit);
}
