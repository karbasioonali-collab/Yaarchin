// برچسب‌های فارسی بخش «نرخ‌ها و هزینه‌ها» (بدون server-only؛ در فرم‌ها و صفحه‌ها)
export const RATE_KIND_FA: Record<string, string> = { market: "بازار", customs: "گمرکی" };
export const CALC_TYPE_FA: Record<string, string> = {
  fixed: "مبلغ ثابت (کل سفارش)",
  percent: "درصد از پایه",
  per_kg: "به ازای هر کیلو",
  per_cbm: "به ازای هر متر مکعب",
  formula: "فرمول",
};
// پایه‌ی درصدی هزینه‌ها، حقوق ورودی و ارزش افزوده
export const BASE_FA: Record<string, string> = { goods: "ارزش کالا", shipping: "هزینه‌ی حمل", costs: "بیمه و هزینه‌های دیگر", duty: "حقوق ورودی" };
export const COST_BASES = ["goods", "shipping"] as const;
export const DUTY_BASES = ["goods", "shipping", "costs"] as const;
export const VAT_BASES = ["goods", "shipping", "costs", "duty"] as const;
export const DUTY_TYPE_FA: Record<string, string> = { percent: "درصد", fixed: "مبلغ ثابت" };
export const FIXED_PER_FA: Record<string, string> = { unit: "هر عدد", kg: "هر کیلو", shipment: "کل محموله" };
export const CUSTOMS_FOR_FA: Record<string, string> = { duty: "حقوق ورودی", vat: "مالیات ارزش افزوده" };
export const METHOD_KEYS = ["air", "sea", "land", "rail"] as const;
export const METHOD_FA: Record<string, string> = { air: "هوایی", sea: "دریایی", land: "زمینی", rail: "ریلی" };
// پیشنهاد ضریب وزن حجمی (کیلو به ازای هر متر مکعب) برای راهنمای فرم
export const FACTOR_HINT: Record<string, string> = { air: "۱۶۷", sea: "۱۰۰۰", land: "۳۳۳", rail: "۳۳۳" };
export const RATE_PERMS = ["rates.enter", "costs.manage", "hs.manage"];
