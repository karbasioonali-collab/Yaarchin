// قالب‌بندی تاریخ و عدد برای نمایش (تقویم شمسی، ساعت تهران).
const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tehran",
});
const num = new Intl.NumberFormat("fa-IR");

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateTime.format(typeof d === "string" ? new Date(d) : d);
}

export function fmtNum(n: number): string {
  return num.format(n);
}

const date = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeZone: "Asia/Tehran" });
// «۵ مهر» (روز و ماه شمسی، بدون سال؛ مثلاً «با نرخ ۵ مهر»)
const dayMonth = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "long", timeZone: "Asia/Tehran" });
export function fmtDayMonth(d: Date | string): string {
  // «2026-09-27» (تاریخ بدون ساعت) ← ظهر تهران، تا جابه‌جایی منطقه‌ی زمانی روز را عوض نکند
  return dayMonth.format(typeof d === "string" ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00+03:30` : d) : d);
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return date.format(typeof d === "string" ? new Date(d) : d);
}

// قیمت دلاری با ارقام فارسی (۱۲٫۵۰)
// دلار فقط در نمایش گرد می‌شود (بخش ۳۸): کمتر از ۱ تا ۳ رقم اعشار (۰٫۰۳۵)، ۱ و بیشتر ۲ رقم (۱۲٫۳۰). در ذخیره و محاسبه گرد کردن نیست.
const usdSmall = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const usdBig = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function fmtUsd(n: number): string {
  return (Math.abs(n) < 1 ? usdSmall : usdBig).format(n);
}

// واحدهای قیمت (products.price_unit)
export const UNITS: Record<string, string> = { piece: "عدد", set: "دست", pair: "جفت", kg: "کیلوگرم", meter: "متر", box: "جعبه", pack: "بسته" };
export function unitFa(u: string): string {
  return UNITS[u] ?? u;
}
