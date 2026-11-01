// پله‌ی متناسب با تعداد (مشترک بین ماشین‌حساب compute.ts و قیمت تعداد مرجع reference.ts). خالص، بدون import با «@/».
export type QtyTier = { minQty: number | null; maxQty: number | null };

// پله‌ی متناسب با تعداد: بزرگ‌ترین «از» که ≤ تعداد باشد (و «تا»ی آن تعداد را بپوشاند)؛ اگر تعداد از همه‌ی پله‌ها کمتر است، پله‌ی اول.
export function pickTier<T extends QtyTier>(tiers: T[], qty: number): { tier: T; below: boolean } | null {
  if (!tiers.length) return null;
  const sorted = [...tiers].sort((a, b) => (a.minQty ?? 1) - (b.minQty ?? 1));
  const cover = sorted.filter((t) => (t.minQty ?? 1) <= qty && (t.maxQty === null || qty <= t.maxQty));
  if (cover.length) return { tier: cover.at(-1)!, below: false };
  const under = sorted.filter((t) => (t.minQty ?? 1) <= qty);
  if (under.length) return { tier: under.at(-1)!, below: false }; // تعداد بین دو پله (فاصله‌ی ثبت‌نشده)
  return { tier: sorted[0], below: true };
}

// گرد کردن فقط برای نمایش عمومی (بخش ۳۸): قیمت هر عدد ← نزدیک‌ترین ۱۰ تومان، جمع سفارش ← نزدیک‌ترین ۱٬۰۰۰ تومان
export const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);
export const round1000 = (n: number) => Math.max(1000, Math.round(n / 1000) * 1000);
