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
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return date.format(typeof d === "string" ? new Date(d) : d);
}

// قیمت دلاری با ارقام فارسی (۱۲٫۵۰)
const money = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function fmtMoney(n: number): string {
  return money.format(n);
}

// واحدهای قیمت (products.price_unit)
const UNITS: Record<string, string> = { piece: "عدد", set: "دست", pair: "جفت", kg: "کیلوگرم", meter: "متر", box: "جعبه", pack: "بسته" };
export function unitFa(u: string): string {
  return UNITS[u] ?? u;
}
