// بازه‌ی گزارش بر اساس روزهای تهران (src/lib/tehran-time.ts). docs/infoyaarchin.md بخش ۲۸.
// امروز، دیروز، ۷ روز اخیر (امروز + ۶ روز قبل)، ۳۰ روز اخیر، یا دلخواه (from/to میلادی از JalaliDateInput).
// بازه‌ی مقایسه = همان تعداد روز، درست قبل از بازه.
import { addDays, daysBetween, tehranRange, tehranYmd, YMD_RE } from "@/lib/tehran-time";

export type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";
export const PRESET_FA: Record<Preset, string> = { today: "امروز", yesterday: "دیروز", "7d": "۷ روز اخیر", "30d": "۳۰ روز اخیر", custom: "بازه‌ی دلخواه" };
export const MAX_RANGE_DAYS = 366;

export type ReportRange = {
  preset: Preset;
  from: string;
  to: string;
  days: number;
  start: Date;
  end: Date;
  prev: { from: string; to: string; start: Date; end: Date };
  error?: string;
};

export function resolveRange(sp: { range?: string; from?: string; to?: string }, now = new Date()): ReportRange {
  const today = tehranYmd(now);
  let preset: Preset = (["today", "yesterday", "7d", "30d", "custom"] as const).find((p) => p === sp.range) ?? "7d";
  let from = today;
  let to = today;
  let error: string | undefined;
  if (preset === "yesterday") from = to = addDays(today, -1);
  else if (preset === "7d") from = addDays(today, -6);
  else if (preset === "30d") from = addDays(today, -29);
  else if (preset === "custom") {
    const f = sp.from && YMD_RE.test(sp.from) ? sp.from : null;
    const t = sp.to && YMD_RE.test(sp.to) ? sp.to : null;
    if (!f || !t) error = "تاریخ «از» و «تا» را انتخاب کنید.";
    else if (f > t) error = "تاریخ «از» بعد از «تا» است.";
    else if (daysBetween(f, t) + 1 > MAX_RANGE_DAYS) error = "بازه حداکثر یک سال است.";
    else if (t > today) error = "تاریخ «تا» در آینده است.";
    if (error) preset = "7d";
    else [from, to] = [f!, t!];
    if (error) from = addDays(today, -6);
  }
  const days = daysBetween(from, to) + 1;
  const pFrom = addDays(from, -days);
  const pTo = addDays(from, -1);
  return { preset, from, to, days, ...tehranRange(from, to), prev: { from: pFrom, to: pTo, ...tehranRange(pFrom, pTo) }, error };
}

// تغییر نسبت به بازه‌ی قبل: «+۱۲٪»، «−۵٪»، «بدون تغییر»، یا «تازه» وقتی قبلی صفر بود
export function delta(cur: number, prev: number): { text: string; dir: "up" | "down" | "flat" } {
  if (cur === prev) return { text: "بدون تغییر", dir: "flat" };
  if (prev === 0) return { text: "تازه", dir: "up" };
  const p = Math.round(((cur - prev) / prev) * 100);
  const fa = Math.abs(p).toLocaleString("fa-IR");
  return p > 0 ? { text: `+${fa}٪`, dir: "up" } : p < 0 ? { text: `−${fa}٪`, dir: "down" } : { text: "≈ بدون تغییر", dir: "flat" };
}
