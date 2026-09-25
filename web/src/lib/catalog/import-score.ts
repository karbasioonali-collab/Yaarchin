// امتیاز «جذاب برای واردات». تنها فهرست مقدارهای مجاز در کد؛ دیتابیس هم همین را با
// CHECK constraint (products_import_score_check، migration ۰۰۰۲) کنترل می‌کند. اگر فهرست عوض شد، هر دو باید عوض شوند.
export const IMPORT_SCORES = [1, 2, 3, 4, 4.5, 5] as const;
export type ImportScore = (typeof IMPORT_SCORES)[number];

// مقدار دیتابیس (numeric ← رشته در pg) یا فرم ← امتیاز مجاز یا null. هر مقدار دیگری null می‌شود.
export function toImportScore(v: unknown): ImportScore | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return (IMPORT_SCORES as readonly number[]).includes(n) ? (n as ImportScore) : null;
}

const fa = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
export function fmtImportScore(s: number | null): string {
  return s === null ? "بدون امتیاز" : fa.format(s);
}
