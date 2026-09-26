// خواندن و اعتبارسنجی ورودی فرم‌های پنل کاتالوگ (دسته، کارخانه، محصول، لیستینگ، قیمت، مکاتبه).
// بدون server-only تا در تست‌ها هم قابل استفاده باشد؛ هیچ دسترسی به دیتابیس ندارد.
import { toLatinDigits } from "@/lib/validation";

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_HINT = "فقط حروف کوچک انگلیسی، عدد و خط تیره؛ مثل portable-blender. در آدرس صفحه می‌آید.";

export const str = (fd: FormData, k: string, max = 500): string =>
  String(fd.get(k) ?? "")
    .trim()
    .slice(0, max);

export const optStr = (fd: FormData, k: string, max = 500): string | null => str(fd, k, max) || null;

// عدد (ارقام فارسی و «٫» هم پذیرفته می‌شود). خالی ← null؛ نامعتبر ← NaN (تا پیام خطا بدهیم، نه اینکه بی‌صدا خالی شود).
export function num(raw: unknown): number | null {
  const s = toLatinDigits(String(raw ?? ""))
    .replace(/[٫،,]/g, (c) => (c === "٫" ? "." : ""))
    .trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export const isBad = (n: number | null) => n !== null && (Number.isNaN(n) || n <= 0);
export const isBadInt = (n: number | null) => n !== null && (Number.isNaN(n) || n <= 0 || !Number.isInteger(n));

// فقط آدرس https (یا مسیر داخلی /media/…). جلوی javascript: و http بی‌امن را می‌گیرد.
export function httpsUrl(raw: string): string | null {
  if (!raw) return null;
  if (raw.startsWith("/media/")) return raw;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// زمان از input نوع datetime-local (بدون منطقه‌ی زمانی) = ساعت تهران (+03:30؛ ایران از ۱۴۰۱ ساعت تابستانی ندارد)
export function tehranLocal(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}:00+03:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toTehranLocalInput(d: Date): string {
  const t = new Date(d.getTime() + 3.5 * 3600 * 1000);
  return t.toISOString().slice(0, 16);
}

// ردیف‌های تکرارشونده‌ی فرم (RowsEditor): name[] ها را کنار هم می‌گذارد و ردیف کاملاً خالی را کنار می‌گذارد
export function rows(fd: FormData, cols: string[]): Record<string, string>[] {
  const lists = cols.map((c) => fd.getAll(c).map((v) => toLatinDigits(String(v)).trim()));
  const n = Math.max(0, ...lists.map((l) => l.length));
  const out: Record<string, string>[] = [];
  for (let i = 0; i < n; i++) {
    const r = Object.fromEntries(cols.map((c, j) => [c, lists[j][i] ?? ""]));
    if (Object.values(r).some((v) => v !== "")) out.push(r);
  }
  return out;
}

// پله‌های تعداد: از/تا (تا خالی = بدون سقف). از > تا یا هم‌پوشانی رد می‌شود.
export type Tier = { minQty: number | null; maxQty: number | null };
export function tierError(tiers: Tier[]): string | null {
  const sorted = [...tiers].sort((a, b) => (a.minQty ?? 0) - (b.minQty ?? 0));
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.minQty !== null && t.maxQty !== null && t.minQty > t.maxQty) return "در هر پله «از» نباید بیشتر از «تا» باشد.";
    const next = sorted[i + 1];
    if (next && (t.maxQty === null || (next.minQty ?? 0) <= t.maxQty)) return "پله‌های تعداد هم‌پوشانی دارند.";
  }
  return null;
}
