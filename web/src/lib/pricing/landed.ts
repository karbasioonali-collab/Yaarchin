import "server-only";
// قیمت تمام‌شده‌ی رسیده به ایران (بازه، با تاریخ و اعتبار).
// اصل ۱۱: عدد فقط از جدول‌های نرخ و ماشین‌حساب می‌آید، هرگز از AI و هرگز حدسی.
// جدول‌های نرخ ارز، حمل، بیمه و حقوق گمرکی در مرحله‌ی ۶ ساخته می‌شوند؛ تا آن موقع همیشه «unavailable» برمی‌گردد
// و صفحه پیام «به‌زودی» نشان می‌دهد، نه یک عدد ساختگی.
import type { PriceSummary } from "@/lib/catalog/public";

export type LandedCost =
  | { status: "unavailable"; reason: "rates_not_configured" | "no_price" }
  | {
      status: "ok";
      currency: "IRR";
      unit: string;
      min: number;
      max: number;
      // تاریخ نرخ‌هایی که در محاسبه استفاده شد و تا کی معتبر است
      ratesDate: string;
      validUntil: string;
    };

export async function landedCostFor(input: { price: PriceSummary | null; hsCode: string | null }): Promise<LandedCost> {
  if (!input.price) return { status: "unavailable", reason: "no_price" };
  // مرحله‌ی ۶: خواندن آخرین نرخ ارز و نسخه‌ی معتبر هزینه‌ها و حقوق ورودی HS code، و محاسبه‌ی بازه.
  return { status: "unavailable", reason: "rates_not_configured" };
}
