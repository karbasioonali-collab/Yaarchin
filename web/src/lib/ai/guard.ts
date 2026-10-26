// محافظ خروجی دستیار (در کد سرور، نه فقط دستورالعمل مدل). هر جواب قبل از نمایش به مشتری از اینجا رد می‌شود.
// بدون server-only تا تست واحد مستقیم اجرایش کند؛ فهرست کارخانه‌ها را guard-terms.ts از دیتابیس می‌سازد.
// docs/infoyaarchin.md بخش ۲۹.
import { compact, normFa } from "./normalize";

export type GuardHit = { type: "url" | "email" | "phone" | "shop_site" | "company_pattern" | "blacklist"; match: string };

// سایت‌ها و بازارهای خرید (لاتین و فارسی). مقایسه روی متن «فشرده» (بدون فاصله و نیم‌فاصله)
const SHOP_SITES = [
  "alibaba",
  "aliexpress",
  "1688",
  "taobao",
  "tmall",
  "jd.com",
  "made-in-china",
  "madeinchina",
  "globalsources",
  "dhgate",
  "temu",
  "shein",
  "amazon",
  "ebay",
  "digikala",
  "torob",
  "divar",
  "basalam",
  "emalls",
  "snappshop",
  "okala",
  "banimode",
  "علی بابا",
  "علیبابا",
  "الیبابا",
  "علی اکسپرس",
  "آلی اکسپرس",
  "الی اکسپرس",
  "تائوبائو",
  "تمو",
  "دیجی کالا",
  "دیجیکالا",
  "ترب",
  "باسلام",
  "ایمالز",
  "آمازون",
  "امازون",
];
// کلمه‌های فارسی کوتاه که معنای عادی هم دارند (ترب، تمو) فقط به‌شکل کلمه‌ی کامل بررسی می‌شوند؛ «دیوار» اصلاً در فهرست نیست (کلمه‌ی رایج؛ divar لاتین هست).
const WHOLE_WORD_FA = new Set(["ترب", "تمو", "باسلام", "امازون", "آمازون"]);

const COMPANY_RE =
  /\b(co\.?\s*,?\s*ltd\.?|company\s+limited|ltd\.?|limited|factory|manufactur\w*|trading|industr(?:y|ial|ies)|inc\.|llc|gmbh|corp\.?|corporation|enterprises?|wholesaler?s?|supplier\s+co)\b/i;
const URL_RE = /(https?:\/\/|www\.)\S+/i;
const DOMAIN_RE = /\b[a-z0-9][a-z0-9-]{1,62}\.(com|net|org|cn|ir|io|co|info|biz|shop|store|online|top|xyz|hk|tw|me|app|asia|site)\b/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// تلفن: + یا 00 و بعد ۸ رقم یا بیشتر؛ یا شماره‌ی ایرانی 0 و ۱۰ رقم؛ یا سه گروه عددی با فاصله/خط تیره. قیمت‌ها (با جداکننده‌ی هزارگان) این شکل را ندارند.
const PHONE_RES = [/(?:\+|\b00)\d[\d\s-]{7,}\d/, /\b0\d{9,10}\b/, /\b\d{3,4}[\s-]\d{3,4}[\s-]\d{3,4}\b/, /\bwhats?app\b|\bwechat\b|واتس\s?اپ|وی\s?چت|تلگرام/i];

export function checkOutput(text: string, blacklist: string[]): { ok: true } | { ok: false; hits: GuardHit[] } {
  const hits: GuardHit[] = [];
  const n = normFa(text);
  const c = compact(text);
  const first = (re: RegExp, s: string) => re.exec(s)?.[0];
  const url = first(URL_RE, n) ?? first(DOMAIN_RE, n);
  if (url) hits.push({ type: "url", match: url });
  const email = first(EMAIL_RE, n);
  if (email) hits.push({ type: "email", match: email });
  for (const re of PHONE_RES) {
    const m = first(re, n);
    if (m) {
      hits.push({ type: "phone", match: m });
      break;
    }
  }
  const words = new Set(n.split(/[^\p{L}\p{N}]+/u));
  for (const site of SHOP_SITES) {
    const hit = WHOLE_WORD_FA.has(site) ? words.has(normFa(site)) : c.includes(compact(site));
    if (hit) {
      hits.push({ type: "shop_site", match: site });
      break;
    }
  }
  const co = first(COMPANY_RE, n);
  if (co) hits.push({ type: "company_pattern", match: co });
  for (const term of blacklist) {
    const t = compact(term);
    if (t.length >= 3 && c.includes(t)) {
      hits.push({ type: "blacklist", match: term });
      break;
    }
  }
  return hits.length ? { ok: false, hits } : { ok: true };
}

export const GUARD_REPLACEMENT = "کارشناس یارچین به‌زودی به این پیام پاسخ می‌دهد.";
