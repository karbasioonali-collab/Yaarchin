// برچسب‌های فارسی پنل کاتالوگ (بدون server-only؛ در فرم‌ها و صفحه‌ها)
export const COMPANY_TYPE_FA: Record<string, string> = { manufacturer: "تولیدکننده", trading: "بازرگانی", unknown: "نامشخص" };
export const COMPANY_STATUS_FA: Record<string, string> = { active: "فعال", blocked: "مسدود", merged: "ادغام‌شده" };
export const PRODUCT_STATUS_FA: Record<string, string> = { draft: "پیش‌نویس", published: "منتشرشده", archived: "مخفی" };
export const LISTING_STATUS_FA: Record<string, string> = { active: "فعال", inactive: "غیرفعال" };
export const CURRENCY_FA: Record<string, string> = { USD: "دلار", CNY: "یوان" };
export const KIND_FA: Record<string, string> = { note: "یادداشت", chat_summary: "خلاصه‌ی چت", chat_message: "پیام چت", email: "ایمیل", call: "تماس تلفنی" };
export const CHANNEL_FA: Record<string, string> = { alibaba_chat: "چت علی‌بابا", email: "ایمیل", wechat: "WeChat", whatsapp: "WhatsApp", phone: "تلفن", other: "سایر" };
export const DIRECTION_FA: Record<string, string> = { inbound: "از کارخانه", outbound: "به کارخانه", internal: "داخلی" };
export const SOURCE_FA: Record<string, string> = { manual: "دستی", extension: "اکستنشن", demo: "نمونه" };
