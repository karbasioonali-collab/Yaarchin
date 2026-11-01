// مشخصات ترکیبی محصول: ویژگی‌های همه‌ی لیستینگ‌ها کنار هم، «مشترک» یا «متفاوت». docs/infoyaarchin.md بخش ۳۸.
// خالص، بدون import با «@/» (تست واحد مستقیم اجرایش می‌کند).
import { isSupplierAttr, norm, translateSpec, type SpecFa } from "./dictionary";

export type ListingSpecs = { listingId: string; attributes: { name: string; value: string }[] };
export type MergedRow = {
  key: string;
  name: string;
  // به ترتیب لیستینگ‌ها؛ null = این لیستینگ این ویژگی را ندارد
  values: (string | null)[];
  // همه‌ی لیستینگ‌هایی که این ویژگی را دارند یک مقدار دارند و دست‌کم دو لیستینگ آن را دارند (یا فقط یک لیستینگ هست)
  common: boolean;
  // اطلاعات کارخانه (برند، محل تولید، مدل): انتخاب‌شدنی نیست
  supplierInfo: boolean;
  // پیشنهاد فارسی برای صفحه‌ی محصول (مقدار مشترک، یا مقدارهای متفاوت با «، »)
  suggestion: SpecFa;
};

const canonList = (v: string) =>
  v
    .split(/\s*[,،/;]\s*/)
    .map(norm)
    .filter(Boolean)
    .sort()
    .join(",");

export function mergeSpecs(listings: ListingSpecs[]): MergedRow[] {
  const rows = new Map<string, MergedRow>();
  listings.forEach((l, i) => {
    for (const a of l.attributes) {
      const key = norm(a.name);
      if (!key || !a.value?.trim()) continue;
      const r = rows.get(key) ?? {
        key,
        name: a.name.trim(),
        values: listings.map(() => null),
        common: false,
        supplierInfo: isSupplierAttr(a.name),
        suggestion: translateSpec(a.name, ""),
      };
      // یک لیستینگ با دو ردیف هم‌نام: مقدارها کنار هم
      r.values[i] = r.values[i] ? `${r.values[i]}، ${a.value.trim()}` : a.value.trim();
      rows.set(key, r);
    }
  });
  for (const r of rows.values()) {
    const present = r.values.filter((v): v is string => v !== null);
    // فهرستِ همان اقلام با ترتیب دیگر («Car, Home» و «Home, Car») یکی حساب می‌شود
    const distinct = [...new Set(present.map(canonList))];
    r.common = distinct.length === 1 && (present.length >= 2 || listings.length === 1);
    const value = distinct.length === 1 ? present[0] : [...new Set(present)].join("، ");
    r.suggestion = translateSpec(r.name, value);
  }
  // مشترک‌ها اول، بعد بیشترین تکرار
  return [...rows.values()].sort((a, b) => Number(b.common) - Number(a.common) || b.values.filter(Boolean).length - a.values.filter(Boolean).length);
}
