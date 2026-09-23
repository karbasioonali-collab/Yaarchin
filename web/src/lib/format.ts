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
