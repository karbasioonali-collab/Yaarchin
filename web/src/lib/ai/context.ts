import "server-only";
// «داده‌های سایت» که همراه سؤال به مدل داده می‌شود. فقط داده‌ی عمومی (همان API عمومی سایت، src/lib/catalog/public.ts):
// هیچ اسم یا اطلاعات کارخانه، هیچ HS code، و قیمت دلاری کارخانه‌ها هم فرستاده نمی‌شود (فقط قیمت تمام‌شده‌ی کارت سایت).
// docs/infoyaarchin.md بخش ۲۹.
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { chatMessages, products } from "@/db/schema";
import { loadPublishedProduct } from "@/lib/catalog/public";
import { clampQty, publicLandedCost, type LandedCost } from "@/lib/pricing/landed";
import { searchKb, type KbHit } from "./kb";
import { tokens } from "./normalize";

export const HISTORY_MESSAGES = 10;
export const HISTORY_CHARS = 800;

export type ProductCtx = {
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  specs: { label: string; value: string }[];
  moq: number | null;
  leadTimeDays: { min: number; max: number } | null;
  // قیمت تمام‌شده برای حداقل سفارش (همان کارت صفحه‌ی محصول)
  landedAtMoq: ReturnType<typeof compactLanded>;
};

export function compactLanded(l: LandedCost) {
  if (l.status !== "ready") return { available: false as const };
  return {
    available: true as const,
    estimated: true,
    qty: l.qty,
    belowMoq: l.belowMoq,
    ratesDate: l.ratesDate,
    methods: l.methods.map((m) => ({ method: m.nameFa, unitToman: m.unit, totalToman: m.total, days: m.days, needsInquiry: m.status !== "ok" })),
  };
}

export async function productCtx(slug: string): Promise<ProductCtx | null> {
  const p = await loadPublishedProduct(slug);
  if (!p) return null;
  return {
    slug: p.slug,
    title: p.titleFa,
    summary: p.summaryFa,
    description: p.descriptionFa ? p.descriptionFa.slice(0, 1500) : null,
    specs: p.specs.slice(0, 20),
    moq: p.moqMin,
    leadTimeDays: p.leadTimeDays,
    landedAtMoq: compactLanded(p.landedCost),
  };
}

export async function slugOf(productId: string | null): Promise<string | null> {
  if (!productId) return null;
  const [p] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.status, "published")));
  return p?.slug ?? null;
}

// محصولات منتشرشده‌ای که اسمشان در پیام مشتری آمده (حداکثر ۲)
export async function mentionedProducts(text: string, exclude: string | null): Promise<string[]> {
  const ts = tokens(text)
    .filter((t) => t.length >= 3)
    .slice(0, 8);
  if (!ts.length) return [];
  const rows = await db
    .select({
      slug: products.slug,
      n: sql<number>`(${sql.join(
        ts.map((t) => sql`(case when ${products.titleFa} ilike ${`%${t}%`} then 1 else 0 end)`),
        sql` + `,
      )})::int`,
    })
    .from(products)
    .where(and(eq(products.status, "published"), or(...ts.map((t) => ilike(products.titleFa, `%${t}%`)))))
    .orderBy(desc(sql`2`))
    .limit(3);
  return rows
    .filter((r) => r.slug !== exclude && r.n >= 1)
    .map((r) => r.slug)
    .slice(0, 2);
}

// تاریخچه‌ی گفتگو برای مدل: فقط پیام‌های متنیِ دیده‌شده‌ی مشتری، آخرین ۱۰ تا، هرکدام حداکثر ۸۰۰ نویسه
export async function historyOf(conversationId: string, uptoId: number): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await db
    .select({ id: chatMessages.id, senderType: chatMessages.senderType, body: chatMessages.body })
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.kind, "text"), eq(chatMessages.visibleToCustomer, true), sql`${chatMessages.id} <= ${uptoId}`))
    .orderBy(desc(chatMessages.id))
    .limit(HISTORY_MESSAGES);
  return rows
    .reverse()
    .filter((r) => r.senderType !== "system")
    .map((r) => ({ role: r.senderType === "customer" ? ("user" as const) : ("assistant" as const), content: r.body.slice(0, HISTORY_CHARS) }));
}

export type SiteContext = { products: ProductCtx[]; kb: KbHit[] };

export async function buildContext(text: string, convProductId: string | null): Promise<SiteContext> {
  const main = await slugOf(convProductId);
  const slugs = [...(main ? [main] : []), ...(await mentionedProducts(text, main))];
  const [prods, kb] = await Promise.all([Promise.all(slugs.map(productCtx)), searchKb(text, 5)]);
  return { products: prods.filter((p): p is ProductCtx => !!p), kb };
}

export function contextText(c: SiteContext): string {
  return JSON.stringify(
    {
      products: c.products,
      knowledge_base: c.kb.map((k) => ({ id: k.id, question: k.question, answer: k.answer })),
    },
    null,
    0,
  );
}

// اجرای ابزار ماشین‌حساب (فقط محصول منتشرشده)
export async function runLandedTool(args: { product_slug?: unknown; qty?: unknown }) {
  const slug = typeof args.product_slug === "string" ? args.product_slug : "";
  const [p] = slug
    ? await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.slug, slug), eq(products.status, "published")))
    : [];
  if (!p) return { error: "product_not_found" };
  return compactLanded(await publicLandedCost(p.id, clampQty(args.qty, 1)));
}
