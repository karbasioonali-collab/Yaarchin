// مرز روزها به وقت ایران (Asia/Tehran) برای محاسبه‌ها (گزارش‌ها). نمایش تاریخ‌ها با این فایل عوض نمی‌شود (src/lib/format.ts).
// «روز» = تاریخ میلادی YYYY-MM-DD در تقویم تهران؛ شروع روز = لحظه‌ی ۰۰:۰۰ تهران (به UTC).
// ایران از ۱۴۰۱ ساعت تابستانی ندارد (+۰۳:۳۰ ثابت)، ولی اینجا اختلاف با خود Intl حساب می‌شود تا به این فرض وابسته نباشد.
// docs/infoyaarchin.md بخش ۲۸.
const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tehran",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

// تاریخ تهرانِ یک لحظه (پیش‌فرض: همین حالا)
export const tehranYmd = (d: Date = new Date()): string => ymdFmt.format(d);

// اختلاف ساعت تهران با UTC در یک لحظه (میلی‌ثانیه)
function offsetAt(t: number): number {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(t / 1000) * 1000;
}

// لحظه‌ی شروع روز (۰۰:۰۰ تهران)
export function tehranDayStart(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t); // اگر اختلاف ساعت همان روز عوض شده باشد (ساعت تابستانی قدیمی)
  return new Date(t);
}

// روز بعد/قبل در تقویم (بدون وابستگی به منطقه‌ی زمانی)
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const utcDay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
// تعداد روز از a تا b (b - a)
export const daysBetween = (a: string, b: string) => Math.round((utcDay(b) - utcDay(a)) / 86_400_000);

// بازه‌ی روزهای [from, to] (هر دو شامل) ← [شروع from، شروع روزِ بعد از to)
export function tehranRange(from: string, to: string): { start: Date; end: Date } {
  return { start: tehranDayStart(from), end: tehranDayStart(addDays(to, 1)) };
}
