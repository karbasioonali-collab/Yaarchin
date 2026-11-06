// متن «زمان رسیدن» با دو بخش جدا (بخش ۵۴): آماده‌سازی کارخانه + حمل. خالص (بدون server-only)؛ صفحه‌ی محصول (کلاینت)،
// جواب‌های کد دستیار و ماشین‌حساب پنل همین را صدا می‌زنند تا متن همه‌جا یکی باشد.
//   هر دو ثبت شده ← «حدود ۲۲ تا ۲۷ روز (۱۵ روز آماده‌سازی کارخانه + ۷ تا ۱۲ روز حمل)»
//   آماده‌سازی ثبت نشده ← «۷ تا ۱۲ روز حمل» (+ یادداشت LEAD_MISSING_NOTE یک بار، جدا؛ یا داخل متن با note: true)
//   حمل ثبت نشده ← «زمان: استعلام»
import { fmtNum } from "../format";

export type DayRange = { min: number; max: number };
export const LEAD_MISSING_NOTE = "زمان آماده‌سازی کارخانه ثبت نشده و به این روزها اضافه می‌شود.";

const span = (r: DayRange) => (r.min === r.max ? fmtNum(r.min) : `${fmtNum(r.min)} تا ${fmtNum(r.max)}`);

export function arrivalText(leadDays: number | null, transit: DayRange | null, opts: { note?: boolean } = {}): string {
  if (!transit) return "زمان: استعلام";
  if (leadDays === null) return `${span(transit)} روز حمل${opts.note ? " (زمان آماده‌سازی کارخانه ثبت نشده)" : ""}`;
  const total = { min: leadDays + transit.min, max: leadDays + transit.max };
  return `حدود ${span(total)} روز (${fmtNum(leadDays)} روز آماده‌سازی کارخانه + ${span(transit)} روز حمل)`;
}

// یادداشت «آماده‌سازی ثبت نشده» یک بار زیر فهرست روش‌ها لازم است؟
export const leadMissing = (leadDays: number | null, methods: { transit: DayRange | null }[]) => leadDays === null && methods.some((m) => m.transit);
