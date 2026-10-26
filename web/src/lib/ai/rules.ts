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
