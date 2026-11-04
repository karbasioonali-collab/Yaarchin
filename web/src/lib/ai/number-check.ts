// «عدد خارج از داده» (بخش ۴۶): مبلغ‌ها و زمان‌های حمل در جواب مدل باید در داده‌هایی باشد که به مدل داده شد
// (داده‌های سایت، نتیجه‌ی ابزار ماشین‌حساب، پیام‌های گفتگو). خالص؛ تست واحد مستقیم اجرایش می‌کند.
//   مبلغ: عدد کنار تومان/تومن/ریال/دلار/یوان/$ (با هزار/میلیون/میلیارد)؛ ±۲٪ اختلاف قبول (گرد کردن: «۳٫۷ میلیون» برای ۳٬۷۱۲٬۰۰۰)
//   زمان: عدد کنار روز/هفته/ماه و بازه‌ی «X تا Y روز»؛ دقیقاً همان عدد
//   بقیه‌ی عددها (تعداد، شماره‌ی فهرست، درصد، سال) سنجیده نمی‌شوند.
// خطر رد اشتباه: شکل دیگر همان عدد («حدود ۴ میلیون» برای ۳٫۷، «۳ هفته» برای ۲۱ روز) یا جمعی که مدل حساب کرده.
import { normFa } from "./normalize";

const SCALE: Record<string, number> = { هزار: 1e3, میلیون: 1e6, ملیون: 1e6, میلیارد: 1e9, ملیارد: 1e9 };
const MONEY = "(?:تومان|تومن|ریال|دلار|یوان|usd|cny|rmb)";
const TIME = "(?:روز|روزه|هفته|ماه)";
const N = "(\\d+(?:\\.\\d+)?)";
const SC = "(هزار|میلیون|ملیون|میلیارد|ملیارد)?";

// رقم لاتین، ممیز فارسی ← نقطه، بدون جداکننده‌ی هزارگان
function prep(s: string): string {
  return normFa(s.replace(/٫/g, ".").replace(/[٬,](?=\d{3}(?!\d))/g, ""))
    .replace(/(\d)[٬,](?=\d{3}(?!\d))/g, "$1")
    .replace(/(\d),(?=\d)/g, "$1");
}

// همه‌ی عددهای داده‌ها (هر شکلی)
export function numbersOf(texts: string[]): number[] {
  const out: number[] = [];
  for (const t of texts) for (const m of prep(t).matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
  return out;
}

export type Claim = { kind: "money" | "time"; value: number; text: string };

// مبلغ‌ها و زمان‌های جواب
export function claimsOf(answer: string): Claim[] {
  const s = prep(answer);
  const out: Claim[] = [];
  const seen = new Set<number>();
  const push = (kind: Claim["kind"], value: number, text: string, at: number) => {
    if (seen.has(at)) return;
    seen.add(at);
    out.push({ kind, value, text: text.trim() });
  };
  // بازه‌ی مبلغ: «از ۳ تا ۵ دلار»، «۳ تا ۵ میلیون تومان»
  for (const m of s.matchAll(new RegExp(`${N}\\s*${SC}\\s*(?:تا|-|–)\\s*${N}\\s*${SC}\\s*(${MONEY})`, "g"))) {
    const sc2 = SCALE[m[4] ?? ""] ?? 1;
    push("money", Number(m[1]) * (SCALE[m[2] ?? ""] ?? sc2), m[0], m.index!);
    push("money", Number(m[3]) * sc2, m[0], m.index! + m[0].indexOf(m[3], m[1].length));
  }
  for (const m of s.matchAll(new RegExp(`${N}\\s*${SC}\\s*(${MONEY})`, "g"))) push("money", Number(m[1]) * (SCALE[m[2] ?? ""] ?? 1), m[0], m.index!);
  for (const m of s.matchAll(new RegExp(`\\$\\s*${N}|${N}\\s*\\$`, "g"))) push("money", Number(m[1] ?? m[2]), m[0], m.index!);
  // بازه‌ی زمان: «۱۷ تا ۲۲ روز»
  for (const m of s.matchAll(new RegExp(`${N}\\s*(?:تا|-|–)\\s*${N}\\s*${TIME}(?![\\p{L}])`, "gu"))) {
    push("time", Number(m[1]), m[0], m.index!);
    push("time", Number(m[2]), m[0], m.index! + m[0].indexOf(m[2], m[1].length));
  }
  for (const m of s.matchAll(new RegExp(`${N}\\s*${TIME}(?![\\p{L}])`, "gu"))) push("time", Number(m[1]), m[0], m.index!);
  return out;
}

const near = (v: number, a: number) => (a === 0 ? v === 0 : Math.abs(v - a) <= Math.abs(a) * 0.02);

// عددهای مشکوک: مبلغ یا زمانی که در داده‌ها نیست (متن کوتاهِ هرکدام برای لاگ و پنل)
export function suspectNumbers(answer: string, sources: string[]): string[] {
  // عددهای خام داده‌ها + همان مبلغ‌ها با مقیاس («۲۰۰ میلیون تومن» در پیام مشتری = ۲۰۰٬۰۰۰٬۰۰۰)
  const allowed = [...numbersOf(sources), ...sources.flatMap((t) => claimsOf(t).map((c) => c.value))];
  const exact = new Set(allowed);
  const bad = claimsOf(answer).filter((c) => (c.kind === "time" ? !exact.has(c.value) : !allowed.some((a) => near(c.value, a))));
  return [...new Set(bad.map((c) => c.text))];
}
