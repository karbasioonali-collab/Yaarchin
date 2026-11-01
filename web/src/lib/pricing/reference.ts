// قیمت عمومی محصول برای «تعداد مرجع» (بخش ۳۸ docs/infoyaarchin.md). تابع خالص، بدون دیتابیس، تا تست واحد مستقیم اجرایش کند.
//
// قاعده (تصمیم مالک، 2026-11-01):
//   - تعداد مرجع = مقدار دستی محصول (products.meta.referenceQty) یا پیش‌فرض: میانه‌ی بالاییِ حداقل سفارش لیستینگ‌ها.
//     حداقل سفارش هر لیستینگ = بیشترِ «MOQ» و «از»ِ پله‌ی اول قیمت.
//   - هر لیستینگ: پله‌ای که تعداد مرجع در آن می‌افتد (همان pickTier ماشین‌حساب)، وسط بازه‌ی همان پله.
//   - لیستینگی که حداقل سفارشش از تعداد مرجع بیشتر است کنار گذاشته می‌شود (در پنل جدا نشان داده می‌شود؛ سایت فقط تعداد را می‌داند).
//   - هر کارخانه یک رأی (میانگین لیستینگ‌هایش)، بعد میانگین کارخانه‌ها. کمترین/بیشترین = کمترین و بیشترین قیمتِ پله‌های استفاده‌شده.
//   - اگر تعداد مرجع دستی از حداقل سفارش همه کمتر باشد، تا کوچک‌ترین حداقل سفارش بالا برده می‌شود (همیشه دست‌کم یک کارخانه).
//   - هیچ گرد کردنی اینجا نیست؛ گرد کردن فقط در نمایش (src/lib/format.ts → fmtUsd).
import { pickTier } from "./tiers";

export type RefTier = { minQty: number | null; maxQty: number | null; priceMin: number; priceMax: number | null };
// قیمت‌ها به دلار (یوان قبلاً با نرخ بازار تبدیل شده)
export type RefListing = { listingId: string; companyId: string; moq: number | null; tiers: RefTier[] };
export type RefOffer = { listingId: string; companyId: string; moq: number; tier: RefTier; price: number };
export type RefPrice = {
  qty: number;
  // تعداد مرجع از کجا آمد
  qtySource: "manual" | "default";
  avg: number;
  min: number;
  max: number;
  suppliers: number;
  used: RefOffer[];
  // حداقل سفارش بیشتر از تعداد مرجع
  excluded: { listingId: string; companyId: string; moq: number }[];
};

export const listingMoq = (l: RefListing): number =>
  Math.max(1, l.moq ?? 1, ...(l.tiers.length ? [[...l.tiers].sort((a, b) => (a.minQty ?? 1) - (b.minQty ?? 1))[0].minQty ?? 1] : []));

// میانه‌ی بالایی: با تعداد زوج، عدد بزرگ‌ترِ وسط (تا دست‌کم نیمی از لیستینگ‌ها این تعداد را بپذیرند)
export function defaultReferenceQty(listings: RefListing[]): number | null {
  const ms = listings
    .filter((l) => l.tiers.length)
    .map(listingMoq)
    .sort((a, b) => a - b);
  return ms.length ? ms[Math.floor(ms.length / 2)] : null;
}

export function referencePrice(listings: RefListing[], manualQty?: number | null): RefPrice | null {
  const priced = listings.filter((l) => l.tiers.length);
  if (!priced.length) return null;
  const manual = manualQty && Number.isInteger(manualQty) && manualQty > 0 ? manualQty : null;
  const minMoq = Math.min(...priced.map(listingMoq));
  const qty = Math.max(manual ?? defaultReferenceQty(priced)!, minMoq);
  const used: RefOffer[] = [];
  const excluded: RefPrice["excluded"] = [];
  for (const l of priced) {
    const moq = listingMoq(l);
    if (moq > qty) {
      excluded.push({ listingId: l.listingId, companyId: l.companyId, moq });
      continue;
    }
    const tier = pickTier(l.tiers, qty)!.tier;
    used.push({ listingId: l.listingId, companyId: l.companyId, moq, tier, price: (tier.priceMin + (tier.priceMax ?? tier.priceMin)) / 2 });
  }
  const perCompany = new Map<string, number[]>();
  for (const o of used) perCompany.set(o.companyId, [...(perCompany.get(o.companyId) ?? []), o.price]);
  const votes = [...perCompany.values()].map((a) => a.reduce((s, x) => s + x, 0) / a.length);
  return {
    qty,
    qtySource: manual ? "manual" : "default",
    avg: votes.reduce((s, x) => s + x, 0) / votes.length,
    min: Math.min(...used.map((o) => o.tier.priceMin)),
    max: Math.max(...used.map((o) => o.tier.priceMax ?? o.tier.priceMin)),
    suppliers: perCompany.size,
    used,
    excluded,
  };
}

// خط «حداقل سفارش از N عدد | قیمت از X تا Y دلار، بسته به تعداد» صفحه‌ی محصول (بخش ۳۹).
// N = کمترین حداقل سفارش لیستینگ‌های قیمت‌دار؛ X/Y = کمترین/بیشترین قیمت همه‌ی پله‌های آخرین نوبت همه‌ی لیستینگ‌ها
// (حتی آن‌هایی که از میانگین تعداد مرجع کنار رفته‌اند). بازه فقط با دست‌کم دو لیستینگ و X ≠ Y؛ وگرنه null (فقط حداقل سفارش).
export type OrderSpan = { moqFrom: number; tierMin: number | null; tierMax: number | null };
export function orderSpan(listings: RefListing[]): OrderSpan | null {
  const priced = listings.filter((l) => l.tiers.length);
  if (!priced.length) return null;
  const lo = Math.min(...priced.flatMap((l) => l.tiers.map((t) => t.priceMin)));
  const hi = Math.max(...priced.flatMap((l) => l.tiers.map((t) => t.priceMax ?? t.priceMin)));
  const range = priced.length >= 2 && hi > lo;
  return { moqFrom: Math.min(...priced.map(listingMoq)), tierMin: range ? lo : null, tierMax: range ? hi : null };
}
