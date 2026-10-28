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

// ---------- «محصولی که مشتری اسمش را آورده» (بخش ۳۴) ----------
// محصولی فقط وقتی همراه سؤال فرستاده می‌شود که مشتری واقعاً اسمش را آورده باشد:
//   ۱. «اسم اصلی کالا» در پیام باشد: اولین کلمه‌ی عنوان که «کلمه‌ی کلی» نیست (پاوربانک، کیسه، آبمیوه‌گیری؛ در «دستگاه آبمیوه‌گیری» ← آبمیوه‌گیری)؛
//   ۲. یا دست‌کم نیمی از کلمه‌های معنادار عنوان (و حداقل ۲) در پیام باشد («قابل حمل شارژی»).
// یک کلمه‌ی ویژگی («چاپ»، «وات») به‌تنهایی محصولی نمی‌آورد. کلمه‌های کلی از پنل قابل ویرایش‌اند (ai.product_generic_words).
export const DEFAULT_GENERIC_WORDS = ["دستگاه", "ست", "پک", "بسته", "مجموعه", "انواع", "مدل", "محصول", "کالا", "سرویس"];
const TITLE_STOP = new Set(["با", "و", "برای", "از", "در", "به", "یا"]);

// کلمه‌ی عنوان به شکل فشرده: نیم‌فاصله و فاصله حذف («آبمیوه‌گیری» = «آبمیوه گیری» = «آبمیوهگیری»)؛ «ی» اضافه‌ی آخر («کیسه‌ی») حذف
const squash = (w: string) =>
  normFa(w.replace(/‌[یي]$/u, "").replace(/ٔ/g, ""))
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();

export function titleTerms(title: string, generic: string[]): { head: string | null; words: string[] } {
  const gen = new Set(generic.map(squash));
  const words = title
    .split(/\s+/)
    .map(squash)
    .filter((w) => w.length >= 2 && !TITLE_STOP.has(w));
  const head = words.find((w) => !gen.has(w) && w.length >= 3 && !/^\d+$/.test(w)) ?? null;
  return { head, words: [...new Set(words.filter((w) => !gen.has(w) && w.length >= 3 && !/^\d+$/.test(w)))] };
}

// امتیاز اشاره‌ی پیام به عنوان (۰ = اشاره نکرده)؛ مقایسه روی متن فشرده‌ی پیام تا پسوندها و نیم‌فاصله فرقی نکنند («پاوربانکتون»)
export function titleMention(text: string, title: string, generic: string[]): number {
  const msg = normFa(text).replace(/[^\p{L}\p{N}]+/gu, "");
  const { head, words } = titleTerms(title, generic);
  const hits = words.filter((w) => msg.includes(w)).length;
  if (head && msg.includes(head)) return hits + 10;
  return hits >= 2 && hits * 2 >= words.length ? hits : 0;
}
