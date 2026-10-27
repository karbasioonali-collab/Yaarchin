// شکل و حجم «داده‌های سایت» که همراه سؤال به مدل می‌رود (بدون server-only تا تست واحد مستقیم اجرایش کند).
// هزینه‌ی هر جواب بیشتر از توکن ورودی است؛ این سقف‌ها حجم را کم نگه می‌دارند بی‌آنکه داده‌ی لازم جواب حذف شود.
// docs/infoyaarchin.md بخش ۳۲.
import { normFa } from "./normalize";

export const LIMITS = {
  descriptionChars: 600,
  specs: 15,
  kbItems: 3,
  kbAnswerChars: 700,
  historyMessages: 6,
  historyChars: 400,
} as const;

// سؤال درباره‌ی قیمت یا هزینه؟ (قیمت تمام‌شده‌ی حداقل سفارش فقط آن وقت فرستاده می‌شود؛ ابزار هم فقط آن وقت)
const PRICE_RE = /(قیمت|هزینه|تمام ?شده|در ?میاد|در ?می ?آید|چند (میشه|می شود|درمیاد|تموم)|تومن|تومان|ارزون|ارزان|گرون|گران|price|cost)/;
export const priceIntent = (text: string): boolean => PRICE_RE.test(normFa(text));

export type LandedCompact =
  | { available: false }
  | {
      available: true;
      estimated: true;
      qty: number;
      belowMoq: boolean;
      ratesDate: string | null;
      methods: { method: string; unitToman: number | null; totalToman: number | null; days: { min: number; max: number } | null; needsInquiry: boolean }[];
    };

export type ProductInput = {
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  specs: { label: string; value: string }[];
  moq: number | null;
  leadTimeDays: { min: number; max: number } | null;
  landedAtMoq: LandedCompact;
};

// محصول برای مدل: بدون فیلد خالی، توضیح و مشخصات با سقف، قیمت تمام‌شده‌ی حداقل سفارش فقط برای سؤال قیمت
export function shapeProduct(p: ProductInput, withPrice: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = { slug: p.slug, title: p.title };
  if (p.summary) out.summary = p.summary;
  if (p.description) out.description = p.description.length > LIMITS.descriptionChars ? p.description.slice(0, LIMITS.descriptionChars) + "…" : p.description;
  if (p.specs.length) out.specs = p.specs.slice(0, LIMITS.specs).map((s) => `${s.label}: ${s.value}`);
  if (p.moq !== null) out.moq = p.moq;
  if (p.leadTimeDays) out.leadTimeDays = p.leadTimeDays;
  if (withPrice) out.landedAtMoq = p.landedAtMoq;
  return out;
}

export type KbInput = { question: string; answer: string };
export const shapeKb = (items: KbInput[]) =>
  items.slice(0, LIMITS.kbItems).map((k) => ({ q: k.question, a: k.answer.length > LIMITS.kbAnswerChars ? k.answer.slice(0, LIMITS.kbAnswerChars) + "…" : k.answer }));

export const trimHistory = <T extends { content: string }>(rows: T[]): T[] =>
  rows.slice(-LIMITS.historyMessages).map((r) => ({ ...r, content: r.content.length > LIMITS.historyChars ? r.content.slice(0, LIMITS.historyChars) + "…" : r.content }));

// متن نهایی داده‌ها (JSON فشرده، بدون کلید خالی)
export function contextJson(c: {
  products: Record<string, unknown>[];
  kb: { q: string; a: string }[];
  landedForQty?: { slug: string; qty: number; result: LandedCompact } | null;
}): string {
  const o: Record<string, unknown> = {};
  if (c.products.length) o.products = c.products;
  if (c.landedForQty) o.landed_cost_for_requested_qty = { product_slug: c.landedForQty.slug, ...c.landedForQty.result };
  if (c.kb.length) o.knowledge_base = c.kb;
  return Object.keys(o).length ? JSON.stringify(o) : "{}";
}
