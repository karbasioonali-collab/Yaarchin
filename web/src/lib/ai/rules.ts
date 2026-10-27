// قاعده‌های قطعی پیش از صدا زدن مدل (بدون هزینه‌ی AI و بدون اتکا به رفتار مدل). docs/infoyaarchin.md بخش ۲۹.
// بدون server-only تا تست واحد مستقیم اجرایش کند.
import { normFa } from "./normalize";

export const HANDOFF_FA: Record<string, string> = {
  proforma: "درخواست پیش‌فاکتور یا فاکتور",
  discount: "درخواست تخفیف",
  final_price: "درخواست قیمت قطعی",
  complaint: "شکایت",
  human: "مشتری کارشناس خواست",
  big_order: "سفارش بزرگ",
  lead_score: "مشتری با امتیاز جدیت بالا",
  restricted: "سؤال درباره‌ی کارخانه، سایت خرید یا شرکت‌ها",
  long_chat: "گفتگوی طولانی",
  customer_cap: "سقف روزانه‌ی پیام مشتری",
  global_cap: "سقف روزانه‌ی دستیار",
  no_source: "جواب در منابع سایت نبود",
  model: "دستیار ارجاع داد",
  leak: "احتمال افشای اطلاعات",
  error: "خطا یا کندی سرویس AI",
  busy: "شلوغی دستیار",
  stuck: "پاسخ دستیار دیر شد",
  parse: "جواب دستیار قابل خواندن نبود",
};

const RULES: [string, RegExp][] = [
  ["proforma", /پیش ?فاکتور|پیش فاکتور|پیشفاکتور|پروفرما|proforma|pro forma|\bpi\b|فاکتور/],
  ["discount", /تخفیف|ارزان ?تر (حساب|بده|میدی|بدید)|کمتر حساب|آف بده/],
  ["final_price", /قیمت (قطعی|نهایی|دقیق)|قطعی (بگو|بگید|بدید|کنید)|نهایی (بگو|کنید)|قیمت فیکس/],
  ["complaint", /شکایت|شاکی|کلاهبردار|خراب (رسید|بود|اومد|امد)|معیوب|مرجوع|پس (بدم|بفرستم|میدم)|پول(م)? رو? (پس|برگردون)|ناراضی|اعتراض/],
  ["human", /کارشناس|اپراتور|پشتیبان انسانی|آدم واقعی|ادم واقعی|انسان واقعی|با یه آدم|با یک نفر|مدیر(تون)?/],
  [
    "restricted",
    /(اسم|نام|آدرس|ادرس|لینک|شماره|تلفن|ایمیل|مشخصات) ?(ی )?(کارخانه|کارخونه|تولید ?کننده|تامین ?کننده|فروشنده|سازنده|برند سازنده)|علی ?بابا|alibaba|1688|made ?in ?china|aliexpress|علی ?اکسپرس|فورواردر|forwarder|ترخیص ?کار|کارگزار گمرک|شرکت حمل|بیمه ?گر|واردکننده (ی )?(دیگه|دیگر)|رقبا|رقیب/,
  ],
];

// عدد سفارش در متن («۵۰۰ تا»، «2000 عدد»، «۲۰ هزار تا»، «۱۰k»). بزرگ‌ترین عدد مرتبط با تعداد.
export function extractQty(text: string): number | null {
  const n = normFa(text)
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/٬/g, "");
  let best: number | null = null;
  const re = /(\d+(?:\.\d+)?)\s*(هزار|k|میلیون)?\s*(تا|عدد|دونه|دانه|پیس|piece|pcs|کارتن|جفت|ست|بسته)?/g;
  for (const m of n.matchAll(re)) {
    if (!m[2] && !m[3]) continue;
    let v = Number(m[1]);
    if (m[2] === "هزار" || m[2] === "k") v *= 1000;
    if (m[2] === "میلیون") v *= 1_000_000;
    if (Number.isFinite(v) && v >= 1 && v <= 100_000_000) best = Math.max(best ?? 0, Math.round(v));
  }
  return best;
}

// دلیل ارجاع فوری بر اساس متن مشتری، یا null
export function preRule(text: string, opts: { bigOrderQty: number }): string | null {
  const n = normFa(text);
  for (const [reason, re] of RULES) if (re.test(n)) return reason;
  const q = extractQty(text);
  if (q !== null && q >= opts.bigOrderQty) return "big_order";
  return null;
}

// ---------- احوال‌پرسی، تشکر، خداحافظی (جواب آماده، بدون مدل) ----------
// پیامی که بعد از حذف علامت‌ها و ایموجی فقط از این کلمه‌ها ساخته شده باشد. اگر حتی یک کلمه‌ی دیگر داشته باشد
// («سلام، قیمتش چنده؟») null ← به مدل می‌رود. docs/infoyaarchin.md بخش ۳۱.
export type Pleasantry = "greeting" | "thanks" | "bye";

// عبارت‌های چندکلمه‌ای (روی متن یکسان‌شده؛ «بخیر» و «به خیر» هر دو)
const PL_PHRASES: [Pleasantry, RegExp][] = [
  ["bye", /خدا ?(نگهدار|حافظ)|روز (خوش|خوبی داشته باشید)|شب (خوش|خوبی داشته باشید)|good ?bye|see you/g],
  ["thanks", /دست(تون| شما)? درد نکنه|thank you|thanks a lot|خیلی ممنون|لطف (کردید|کردین|دارید|دارین)/g],
  ["greeting", /(وقت|روز|صبح|ظهر|عصر|شب)(تون| شما|تان)? (به ?|ب)خیر|خسته نباشی(د|ن)?|خدا قوت|سلام علیکم|good (morning|evening|afternoon)|حال(تون|تان| شما)? (خوبه|چطوره)/g],
];
const PL_WORDS: Record<string, Pleasantry> = Object.fromEntries([
  ...["سلام", "درود", "علیکم", "علیک", "hi", "hello", "hey", "salam", "slm", "خوبی", "خوبین", "خوبید", "چطوری", "چطورید", "چطورین", "احوال", "صبح", "بخیر"].map((w) => [
    w,
    "greeting",
  ]),
  ...[
    "ممنون",
    "ممنونم",
    "مرسی",
    "متشکرم",
    "متشکر",
    "تشکر",
    "سپاس",
    "سپاسگزارم",
    "thanks",
    "thank",
    "thx",
    "merci",
    "mamnoon",
    "mersi",
    "باشه",
    "اوکی",
    "ok",
    "okay",
    "حله",
    "عالی",
    "مچکرم",
  ].map((w) => [w, "thanks"]),
  ...["خداحافظ", "خدانگهدار", "بای", "bye", "فعلا", "فعلن"].map((w) => [w, "bye"]),
]);
// کلمه‌های همراه که معنای سؤال ندارند
const PL_FILLER = new Set("جان جون عزیز عزیزم خیلی زیاد دوست دوستان من شما هم و با ها اقا خانم دیگه you very much so a lot good و ممنونم از لطفتون لطفا".split(" "));

export function pleasantry(text: string): Pleasantry | null {
  if (text.length > 80) return null;
  let n = normFa(text)
    .replace(/(.)\1{2,}/gu, "$1")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return null;
  const kinds = new Set<Pleasantry>();
  for (const [k, re] of PL_PHRASES)
    n = n.replace(re, () => {
      kinds.add(k);
      return " ";
    });
  for (const w of n.split(" ").filter(Boolean)) {
    if (PL_WORDS[w]) kinds.add(PL_WORDS[w]);
    else if (!PL_FILLER.has(w)) return null;
  }
  if (kinds.has("bye")) return "bye";
  if (kinds.has("thanks")) return "thanks";
  return kinds.has("greeting") ? "greeting" : null;
}
