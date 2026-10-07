// تبدیل تاریخ شمسی (جلالی) ↔ میلادی، بدون کتابخانه. هم در سرور و هم در مرورگر (فرم‌ها) استفاده می‌شود.
// الگوریتم استاندارد jalaali-js (بر پایه‌ی جدول «سال‌های شکست» تقویم جلالی؛ MIT) که برای سال‌های ۱ تا ۳۱۷۷ شمسی درست است.
// تست: unit-jalali.mjs همه‌ی روزهای ۱۳۹۰ تا ۱۴۲۰ را با تقویم شمسی خود Intl مقایسه می‌کند. docs/infoyaarchin.md بخش ۲۸.
// فقط تاریخ تقویمی (روز/ماه/سال) است؛ منطقه‌ی زمانی در src/lib/tehran-time.ts.

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;

function jalCal(jy: number) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  if (jy < jp || jy >= BREAKS[BREAKS.length - 1]) throw new RangeError(`سال شمسی خارج از بازه: ${jy}`);
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

export type JalaliDate = { jy: number; jm: number; jd: number };
export type GregorianDate = { gy: number; gm: number; gd: number };

export function toJalali(gy: number, gm: number, gd: number): JalaliDate {
  const jdn = g2d(gy, gm, gd);
  const g = d2g(jdn);
  let jy = g.gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(g.gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function toGregorian(jy: number, jm: number, jd: number): GregorianDate {
  const r = jalCal(jy);
  return d2g(g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1);
}

export const isJalaliLeapYear = (jy: number) => jalCal(jy).leap === 0;

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

export function isValidJalali(jy: number, jm: number, jd: number): boolean {
  return Number.isInteger(jy) && Number.isInteger(jm) && Number.isInteger(jd) && jy >= 1 && jy <= 3177 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= jalaliMonthLength(jy, jm);
}

export const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

// «YYYY-MM-DD» میلادی ↔ تاریخ شمسی (برای فیلدهای مخفی فرم که سرور همان میلادی قبلی را می‌گیرد)
export function isoToJalali(iso: string): JalaliDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return toJalali(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function jalaliToIso(j: JalaliDate): string {
  const g = toGregorian(j.jy, j.jm, j.jd);
  return `${pad(g.gy, 4)}-${pad(g.gm)}-${pad(g.gd)}`;
}

// ورودی کاربر: «۱۴۰۵/۰۷/۱۵»، «1405-7-15»، «۱۴۰۵.۷.۱۵» (ارقام فارسی، عربی یا لاتین) ← تاریخ شمسی معتبر یا null
export function parseJalali(raw: string): JalaliDate | null {
  const s = raw
    .trim()
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  const m = /^(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})$/.exec(s);
  if (!m) return null;
  const [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return isValidJalali(jy, jm, jd) ? { jy, jm, jd } : null;
}

// «۱۴۰۵/۰۷/۱۵» با ارقام فارسی
export function formatJalali(j: JalaliDate): string {
  return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
