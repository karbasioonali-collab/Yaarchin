// نمودار هزینه‌ی هوش مصنوعی (بخش ۵۲): بخش خالص (بدون server-only تا تست واحد مستقیم اجرایش کند).
// ورودی: جمع روزانه‌ی هر purpose به روز تهران (YYYY-MM-DD میلادی). خروجی: ستون‌های روز، هفته، ماه یا سال شمسی با سهم هر گروه.
import { JALALI_MONTHS, jalaliMonthLength, jalaliToIso, toGregorian, toJalali } from "../jalali";
import { addDays } from "../tehran-time";

export const COST_GROUPS = ["chat", "tests", "catalog", "report", "connection", "other"] as const;
export type CostGroup = (typeof COST_GROUPS)[number];
export const COST_GROUP_FA: Record<CostGroup, string> = {
  chat: "چت",
  tests: "آزمون دستیار",
  catalog: "متن محصول",
  report: "تحلیل گزارش",
  connection: "تست اتصال",
  other: "سایر",
};
export const COST_GROUP_COLOR: Record<CostGroup, string> = {
  chat: "#2F7D5C",
  tests: "#FF7A00",
  catalog: "#3B6EA8",
  report: "#7A4FB5",
  connection: "#9A9A94",
  other: "#C9A227",
};
// purpose های ai_requests ← گروه. هر purpose تازه تا اینجا اضافه نشود «سایر» است.
export function costGroup(purpose: string): CostGroup {
  if (purpose === "chat") return "chat";
  if (purpose === "test_run" || purpose === "suggest") return "tests";
  if (purpose === "catalog_text") return "catalog";
  if (purpose === "report_insight") return "report";
  if (purpose === "connection_test") return "connection";
  return "other";
}

export type Period = "day" | "week" | "month" | "year";
export const PERIODS: Period[] = ["day", "week", "month", "year"];
export const PERIOD_FA: Record<Period, string> = { day: "روزانه", week: "هفتگی", month: "ماهانه", year: "سالانه" };
// چند ستون: روز ۳۰، هفته ۱۲، ماه ۱۲ (شمسی)، سال همه
export const PERIOD_BARS: Record<Exclude<Period, "year">, number> = { day: 30, week: 12, month: 12 };
export const PERIOD_WINDOW_FA: Record<Period, string> = { day: "۳۰ روز اخیر", week: "۱۲ هفته‌ی اخیر", month: "۱۲ ماه اخیر", year: "همه‌ی سال‌ها" };

const fa = (n: number) => n.toLocaleString("fa-IR", { useGrouping: false });
const jOf = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return toJalali(y, m, d);
};
// روز هفته‌ی شمسی: شنبه = ۰ … جمعه = ۶ (getUTCDay: یکشنبه = ۰، شنبه = ۶)
const satIndex = (ymd: string) => (new Date(ymd + "T12:00:00Z").getUTCDay() + 1) % 7;
export const weekStart = (ymd: string) => addDays(ymd, -satIndex(ymd));
const monthStart = (ymd: string) => {
  const j = jOf(ymd);
  return jalaliToIso({ jy: j.jy, jm: j.jm, jd: 1 });
};
const yearStart = (ymd: string) => jalaliToIso({ jy: jOf(ymd).jy, jm: 1, jd: 1 });
const monthEnd = (start: string) => {
  const j = jOf(start);
  return jalaliToIso({ jy: j.jy, jm: j.jm, jd: jalaliMonthLength(j.jy, j.jm) });
};
const yearEnd = (start: string) => {
  const jy = jOf(start).jy;
  return jalaliToIso({ jy, jm: 12, jd: jalaliMonthLength(jy, 12) });
};
const prevMonthStart = (start: string) => {
  const j = jOf(start);
  return jalaliToIso(j.jm === 1 ? { jy: j.jy - 1, jm: 12, jd: 1 } : { jy: j.jy, jm: j.jm - 1, jd: 1 });
};

// شروع ستونی که این روز در آن است
export function bucketStart(ymd: string, p: Period): string {
  return p === "day" ? ymd : p === "week" ? weekStart(ymd) : p === "month" ? monthStart(ymd) : yearStart(ymd);
}

export function bucketLabel(start: string, p: Period): string {
  const j = jOf(start);
  if (p === "day") return `${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]}`;
  if (p === "week") return `هفته‌ی ${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]}`;
  if (p === "month") return `${JALALI_MONTHS[j.jm - 1]} ${fa(j.jy)}`;
  return fa(j.jy);
}
// برچسب کوتاه زیر ستون
export function bucketTick(start: string, p: Period): string {
  const j = jOf(start);
  if (p === "day" || p === "week") return `${fa(j.jd)}/${fa(j.jm)}`;
  if (p === "month") return JALALI_MONTHS[j.jm - 1];
  return fa(j.jy);
}

// ستون‌ها از قدیم به جدید؛ آخرین ستون همانی است که امروز در آن است
export function bucketStarts(p: Period, today: string, firstDay: string | null): string[] {
  const cur = bucketStart(today, p);
  if (p === "year") {
    const first = jOf(firstDay && firstDay < today ? firstDay : today).jy;
    const out: string[] = [];
    for (let y = first; y <= jOf(today).jy; y++) out.push(jalaliToIso({ jy: y, jm: 1, jd: 1 }));
    return out;
  }
  const out = [cur];
  for (let i = 1; i < PERIOD_BARS[p]; i++) out.unshift(p === "day" ? addDays(out[0], -1) : p === "week" ? addDays(out[0], -7) : prevMonthStart(out[0]));
  return out;
}

export function bucketEnd(start: string, p: Period): string {
  return p === "day" ? start : p === "week" ? addDays(start, 6) : p === "month" ? monthEnd(start) : yearEnd(start);
}

export type CostRow = { ymd: string; purpose: string; cost: number };
export type Bar = { start: string; end: string; label: string; tick: string; parts: Record<CostGroup, number>; total: number };
const empty = (): Record<CostGroup, number> => ({ chat: 0, tests: 0, catalog: 0, report: 0, connection: 0, other: 0 });

export function costChart(rows: CostRow[], p: Period, today: string) {
  const first = rows.reduce<string | null>((m, r) => (m === null || r.ymd < m ? r.ymd : m), null);
  const starts = bucketStarts(p, today, first);
  const idx = new Map(starts.map((s, i) => [s, i]));
  const bars: Bar[] = starts.map((s) => ({ start: s, end: bucketEnd(s, p), label: bucketLabel(s, p), tick: bucketTick(s, p), parts: empty(), total: 0 }));
  const allParts = empty();
  let all = 0;
  for (const r of rows) {
    const g = costGroup(r.purpose);
    allParts[g] += r.cost;
    all += r.cost;
    const i = idx.get(bucketStart(r.ymd, p));
    if (i === undefined || r.ymd > today) continue;
    bars[i].parts[g] += r.cost;
    bars[i].total += r.cost;
  }
  const windowTotal = bars.reduce((s, b) => s + b.total, 0);
  return { bars, windowTotal, all, allParts, first };
}

// ماه شمسی جاری (برای کارت خلاصه‌ی صفحه‌ی دستیار)
export function monthTotal(rows: CostRow[], today: string): number {
  const s = monthStart(today);
  return rows.reduce((t, r) => (r.ymd >= s && r.ymd <= today ? t + r.cost : t), 0);
}

// مقیاس محور عمودی: سقف «گرد» بالای بیشترین ستون (۱، ۱٫۵، ۲، ۲٫۵، ۳، ۴، ۵، ۶، ۸ × توان ۱۰) تا ستون‌ها بیشتر ارتفاع را بگیرند
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// برای تست: تبدیل‌های مرزی بدون وابستگی به ساعت سیستم
export const _internal = { satIndex, monthStart, yearStart, monthEnd, yearEnd, toGregorian };
