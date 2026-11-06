// «عدد خارج از داده» (بخش ۴۶): مبلغ‌ها و زمان‌های حمل در جواب مدل باید در داده‌هایی باشد که به مدل داده شد
// (داده‌های سایت، نتیجه‌ی ابزار ماشین‌حساب، پیام‌های گفتگو). خالص؛ تست واحد مستقیم اجرایش می‌کند.
//   مبلغ: عدد کنار تومان/تومن/ریال/دلار/یوان/$ (با هزار/میلیون/میلیارد)؛ ±۲٪ اختلاف قبول (گرد کردن: «۳٫۷ میلیون» برای ۳٬۷۱۲٬۰۰۰)
//   زمان: عدد کنار روز/هفته/ماه و بازه‌ی «X تا Y روز»؛ دقیقاً همان عدد
//   بی‌واحد (بخش ۵۳): در خطی که درباره‌ی قیمت یا حمل است («زمینی: ۳۴۰»)، و «۳۴۰ هزار» بدون تومان؛ درست اگر خودش یا ×هزار/×میلیون آن
//     (شکل خلاصه‌ی مبلغ) در داده‌ها باشد (±۲٪)
//   بقیه‌ی عددها (تعداد، شماره‌ی فهرست، درصد، سال، عدد کوچک‌تر از ۱۰) سنجیده نمی‌شوند.
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

export type Claim = { kind: "money" | "time" | "bare"; value: number; text: string };

// خطی درباره‌ی قیمت یا حمل (فقط در این خط‌ها عدد بی‌واحد سنجیده می‌شود)
const PRICE_SHIP_LINE = /(قیمت|هزینه|حمل|زمینی|هوایی|دریایی|ریلی|کشتی|قطار|تحویل|مرز|ارسال|کرایه|تومان|تومن|دلار|یوان)/;
// بعد از عدد بی‌واحد: این‌ها یعنی عدد مبلغ/زمان نیست (یا قبلاً سنجیده شده)
const NOT_BARE_AFTER =
  /^\s*(?:%|٪|درصد|عدد|تا\b|تا(?![\p{L}])|دونه|دانه|کارتن|بسته|جفت|ست|پیس|pcs|سال|ساله|کیلو|گرم|متر|سانت|لیتر|وات|ولت|میلی|نفر|بار|مرحله|روش|مدل|رنگ|\.\s|\)|[-–]\s*\d)/u;

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
  // جای عددهایی که بالا سنجیده شدند (تا دوباره «بی‌واحد» حساب نشوند)
  const used: [number, number][] = [];
  const mark = (re: RegExp) => {
    for (const m of s.matchAll(re)) used.push([m.index!, m.index! + m[0].length]);
  };
  mark(new RegExp(`${N}\\s*${SC}\\s*(?:تا|-|–)\\s*${N}\\s*${SC}\\s*(${MONEY})`, "g"));
  mark(new RegExp(`${N}\\s*${SC}\\s*(${MONEY})`, "g"));
  mark(new RegExp(`\\$\\s*${N}|${N}\\s*\\$`, "g"));
  mark(new RegExp(`${N}\\s*(?:تا|-|–)\\s*${N}\\s*${TIME}(?![\\p{L}])`, "gu"));
  mark(new RegExp(`${N}\\s*${TIME}(?![\\p{L}])`, "gu"));
  const isUsed = (at: number) => used.some(([a, b]) => at >= a && at < b);
  // «۳۴۰ هزار» بدون واحد پول (و نه «۵ هزار تا/عدد»)
  for (const m of s.matchAll(new RegExp(`${N}\\s*(هزار|میلیون|ملیون|میلیارد|ملیارد)(?![\\p{L}])`, "gu"))) {
    if (isUsed(m.index!) || NOT_BARE_AFTER.test(s.slice(m.index! + m[0].length))) continue;
    used.push([m.index!, m.index! + m[0].length]);
    push("money", Number(m[1]) * SCALE[m[2]], m[0], m.index!);
  }
  // عدد بی‌واحد در خط قیمت/حمل
  let off = 0;
  for (const line of s.split("\n")) {
    if (PRICE_SHIP_LINE.test(line)) {
      for (const m of line.matchAll(/\d+(?:\.\d+)?/g)) {
        const at = off + m.index!;
        const v = Number(m[0]);
        if (isUsed(at) || v < 10) continue;
        // شماره‌ی فهرست اول خط («1. …»، «2) …»)
        if (/^\s*[-*•]?\s*$/.test(line.slice(0, m.index!)) && /^[.)]/.test(line.slice(m.index! + m[0].length))) continue;
        if (NOT_BARE_AFTER.test(line.slice(m.index! + m[0].length))) continue;
        // جزئی از عدد اعشاری/بزرگ‌تر نیست (مثلاً «3.5» یک عدد است)
        push("bare", v, m[0], at);
      }
    }
    off += line.length + 1;
  }
  return out;
}

const near = (v: number, a: number) => (a === 0 ? v === 0 : Math.abs(v - a) <= Math.abs(a) * 0.02);

// عددهای مشکوک: مبلغ یا زمانی که در داده‌ها نیست (متن کوتاهِ هرکدام برای لاگ و پنل)
export function suspectNumbers(answer: string, sources: string[]): string[] {
  // عددهای خام داده‌ها + همان مبلغ‌ها با مقیاس («۲۰۰ میلیون تومن» در پیام مشتری = ۲۰۰٬۰۰۰٬۰۰۰)
  const allowed = [...numbersOf(sources), ...sources.flatMap((t) => claimsOf(t).map((c) => c.value))];
  const exact = new Set(allowed);
  const bad = claimsOf(answer).filter((c) =>
    c.kind === "time"
      ? !exact.has(c.value)
      : c.kind === "bare"
        ? // بی‌واحد: خودش، یا شکل خلاصه‌ی یک مبلغ (۳۴۰ برای ۳۴۰٬۰۰۰ یا ۳۴۰ میلیون)
          !allowed.some((a) => near(c.value, a) || near(c.value * 1e3, a) || near(c.value * 1e6, a))
        : !allowed.some((a) => near(c.value, a)),
  );
  return [...new Set(bad.map((c) => c.text))];
}
