// «متن فارسی محصول با AI» (PR ۴ب): بخش خالص (بدون دیتابیس) تا تست واحد مستقیم اجرایش کند. docs/infoyaarchin.md بخش ۴۰.
//   buildDraftInput ← ورودی AI از لیستینگ‌ها: اسم انگلیسی، Highlights واقعی، مشخصات؛ بدون اطلاعات کارخانه؛ ترجمه‌ی واژه‌نامه جدا
//   DRAFT_PROMPT / draftUserMessage ← دستورالعمل و پیام
//   parseDraft ← JSON خروجی ← شکل ثابت، بعد یکسان‌سازی متن فارسی (normalizeFa)
//   checkDraft ← محافظ: محافظ دستیار (اسم و شناسه‌ی کارخانه، سایت، تلفن) + قیمت/ارز + عدد ساختگی + شهر و استان چین
import { checkOutput } from "../ai/guard";
import { isSupplierAttr, translateSpec } from "../import/dictionary";
import { normalizeFa } from "../text/fa-normalize";

export type DraftSpec = { labelFa: string; valueFa: string; unit: string };
export type DraftOutput = { titleFa: string; summaryFa: string; descriptionFa: string; specs: DraftSpec[] };
export type DraftInput = {
  titles: string[];
  highlights: string[];
  // مشخصاتی که واژه‌نامه کامل ترجمه نکرد (به AI می‌رود)
  specs: { name: string; value: string }[];
  // ترجمه‌شده با واژه‌نامه (رایگان؛ به AI نمی‌رود)
  localSpecs: DraftSpec[];
};
export type DraftHit = { type: string; match: string };

export type ListingText = { titleEn: string | null; specs: unknown };

const LIMITS = { titles: 5, highlights: 15, specs: 40, text: 300 };

// اسم و شناسه‌ی کارخانه‌ها (فهرست محافظ دستیار) از متن ورودی هم پاک می‌شود، قبل از ارسال
export function scrub(text: string, blacklist: string[]): string {
  let s = text;
  for (const term of blacklist) {
    if (term.trim().length < 3) continue;
    s = s.replace(new RegExp(term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  return s.replace(/\s+/g, " ").trim();
}

const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string => (typeof x === "string" ? x : "");

export function buildDraftInput(listings: ListingText[], blacklist: string[]): DraftInput {
  const titles = new Set<string>();
  const highlights = new Set<string>();
  const specs = new Map<string, { name: string; value: string }>();
  const local = new Map<string, DraftSpec>();
  for (const l of listings) {
    const t = scrub(l.titleEn ?? "", blacklist).slice(0, LIMITS.text);
    if (t) titles.add(t);
    const sp = (l.specs ?? {}) as { highlights?: unknown; attributes?: unknown };
    // فقط Highlights واقعی (خواننده‌ی نسخه‌ی ۲؛ عبارت‌های تبلیغاتی در promoPhrases صفحه‌ی خام‌اند و به لیستینگ نمی‌آیند)
    for (const h of arr(sp.highlights)) {
      const x = scrub(str(h), blacklist).slice(0, LIMITS.text);
      if (x) highlights.add(x);
    }
    for (const a of arr(sp.attributes)) {
      const name = str((a as { name?: unknown }).name).trim();
      const value = scrub(str((a as { value?: unknown }).value), blacklist).slice(0, LIMITS.text);
      if (!name || !value || isSupplierAttr(name)) continue;
      const key = `${name.toLowerCase()}|${value.toLowerCase()}`;
      const tr = translateSpec(name, value);
      if (tr.translated.label && tr.translated.value) local.set(key, { labelFa: tr.labelFa, valueFa: tr.valueFa, unit: tr.unit });
      else specs.set(key, { name, value });
    }
  }
  return {
    titles: [...titles].slice(0, LIMITS.titles),
    highlights: [...highlights].slice(0, LIMITS.highlights),
    specs: [...specs.values()].slice(0, LIMITS.specs),
    localSpecs: [...local.values()],
  };
}

export const DRAFT_PROMPT = `You are a Persian product copywriter for Yarchin, an Iranian service that imports goods from China. Write natural, clear Persian (Farsi) for a product page, using ONLY the data given.
Rules (strict):
- Never mention any factory, supplier, seller, brand, trademark, company, city, province or place of manufacture, website or contact.
- Never mention prices, costs, currencies (dollar, toman, yuan, $, ¥), discounts or minimum order.
- Every number you write must appear in the data exactly. Do not invent sizes, weights, quantities or percentages. If unsure, leave the number out.
- No marketing exaggeration; describe features factually. Do not use English words except model-like terms already in the data.
- titleFa: a short Persian product name (max 60 characters). summaryFa: one line (max 120 characters). descriptionFa: 2–4 short paragraphs or bullet lines (start bullets with «•»), max 900 characters.
- specs: translate each given spec into Persian {"name": <original name>, "labelFa", "valueFa", "unit"} (unit may be "").
Reply with JSON only: {"titleFa": "...", "summaryFa": "...", "descriptionFa": "...", "specs": [...]}`;

export function draftUserMessage(input: DraftInput): string {
  return [
    "PRODUCT DATA",
    `Titles:\n${input.titles.map((t) => `- ${t}`).join("\n") || "-"}`,
    `Features:\n${input.highlights.map((h) => `- ${h}`).join("\n") || "-"}`,
    `Specs to translate:\n${input.specs.map((s) => `- ${s.name}: ${s.value}`).join("\n") || "-"}`,
    `Already translated (context only):\n${input.localSpecs.map((s) => `- ${s.labelFa}: ${s.valueFa}${s.unit ? ` ${s.unit}` : ""}`).join("\n") || "-"}`,
  ].join("\n\n");
}

// JSON ← شکل ثابت؛ متن داخل ```json یا با متن اضافه هم پذیرفته می‌شود
export function parseDraft(raw: string): DraftOutput | null {
  const m = /\{[\s\S]*\}/.exec(raw ?? "");
  if (!m) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const t = (x: unknown, max: number) => normalizeFa(str(x)).slice(0, max);
  const out: DraftOutput = {
    titleFa: t(j.titleFa, 100),
    summaryFa: t(j.summaryFa, 200),
    descriptionFa: t(j.descriptionFa, 1500),
    specs: arr(j.specs)
      .map((s) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return { labelFa: t(o.labelFa, 80), valueFa: t(o.valueFa, 200), unit: t(o.unit, 40) };
      })
      .filter((s) => s.labelFa && s.valueFa)
      .slice(0, 60),
  };
  return out.titleFa || out.summaryFa || out.descriptionFa || out.specs.length ? out : null;
}

// رقم فارسی و عربی ← لاتین؛ «٫» ← «.»
const latin = (s: string) =>
  s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, ".");
// عددها؛ جداکننده‌ی هزارگان (۲٬۵۰۰ / 2,500) حذف
export const numbersIn = (s: string): string[] =>
  (
    latin(s)
      .replace(/(\d)[,٬](?=\d{3}\b)/g, "$1")
      .match(/\d+(?:\.\d+)?/g) ?? []
  ).map((x) => String(Number(x)));

const PRICE_RE = /(دلار|تومان|تومن|ریال|یوان|یورو|قیمت|ارزان|تخفیف|حداقل سفارش|\$|¥|€|\busd\b|\bcny\b|\brmb\b|\bprice\b)/i;
// شهر و استان‌های چین (لاتین و فارسی) — محل تولید هم اطلاعات کارخانه است
const PLACES = [
  "guangdong",
  "zhejiang",
  "jiangsu",
  "fujian",
  "shandong",
  "anhui",
  "hebei",
  "henan",
  "hubei",
  "hunan",
  "jiangxi",
  "sichuan",
  "shanghai",
  "beijing",
  "shenzhen",
  "guangzhou",
  "yiwu",
  "ningbo",
  "dongguan",
  "foshan",
  "xiamen",
  "hangzhou",
  "tianjin",
  "qingdao",
  "wenzhou",
  "taizhou",
  "suzhou",
  "jinhua",
  "chaozhou",
  "shantou",
  "zhongshan",
  "jieyang",
  "quanzhou",
  "گوانگدونگ",
  "ژجیانگ",
  "چجیانگ",
  "جیانگسو",
  "فوجیان",
  "شاندونگ",
  "آنهویی",
  "هبی",
  "هنان",
  "هوبی",
  "هونان",
  "سیچوان",
  "شانگهای",
  "پکن",
  "شنژن",
  "گوانگژو",
  "ییوو",
  "ایوو",
  "نینگبو",
  "دونگگوان",
  "فوشان",
  "شیامن",
  "هانگژو",
  "تیانجین",
  "چینگدائو",
  "ونژو",
  "سوژو",
];

export function checkDraft(out: DraftOutput, input: DraftInput, blacklist: string[]): DraftHit[] {
  const hits: DraftHit[] = [];
  const all = [out.titleFa, out.summaryFa, out.descriptionFa, ...out.specs.flatMap((s) => [s.labelFa, s.valueFa, s.unit])].join("\n");
  const g = checkOutput(all, blacklist);
  if (!g.ok) hits.push(...g.hits.map((h) => ({ type: h.type, match: h.match })));
  const price = PRICE_RE.exec(all);
  if (price) hits.push({ type: "price", match: price[0] });
  const low = all.toLowerCase();
  const place = PLACES.find((p) => (/^[a-z]+$/.test(p) ? new RegExp(`\\b${p}\\b`).test(low) : low.includes(p)));
  if (place) hits.push({ type: "place", match: place });
  const allowed = new Set(
    numbersIn([...input.titles, ...input.highlights, ...input.specs.flatMap((s) => [s.name, s.value]), ...input.localSpecs.flatMap((s) => [s.valueFa])].join("\n")),
  );
  const extra = numbersIn(all).find((n) => !allowed.has(n));
  if (extra !== undefined) hits.push({ type: "number", match: extra });
  return hits;
}

export const HIT_FA: Record<string, string> = {
  url: "لینک",
  email: "ایمیل",
  phone: "تلفن",
  shop_site: "اسم سایت خرید",
  company_pattern: "اسم شرکت",
  blacklist: "اسم یا شناسه‌ی کارخانه",
  price: "قیمت یا ارز",
  place: "شهر یا استان",
  number: "عددی که در داده نبود",
};

// تخمین توکن: انگلیسی حدود ۴ نویسه، فارسی حدود ۲٫۵ نویسه برای هر توکن؛ خروجی فارسی حدود ۹۰۰ توکن
export function estimateTokens(input: DraftInput): { prompt: number; completion: number } {
  const msg = draftUserMessage(input);
  return { prompt: Math.ceil(DRAFT_PROMPT.length / 4 + msg.length / 3.5) + 20, completion: 300 + input.specs.length * 25 + 500 };
}

// حالت آزمایشی (بدون کلید): فقط مشخصاتِ واژه‌نامه، بدون متن
export function fakeDraft(input: DraftInput): DraftOutput {
  return { titleFa: "", summaryFa: "", descriptionFa: "", specs: input.localSpecs.map((s) => ({ ...s, valueFa: normalizeFa(s.valueFa) })) };
}
