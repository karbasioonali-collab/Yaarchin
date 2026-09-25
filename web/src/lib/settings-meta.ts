// تنظیم‌هایی که ذخیره می‌شوند ولی هنوز هیچ کدی آن‌ها را نمی‌خواند (روشن/خاموش کردنشان فعلاً اثری ندارد).
// در صفحه‌ی تنظیمات کنارشان برچسب «هنوز ساخته نشده» می‌آید. هر بخشی که ساخته شد و کدش تنظیم را خواند،
// کلیدش را از این فهرست حذف کن (docs/infoyaarchin.md بخش ۱۷، «سوئیچ‌های بی‌اثر»).
export const NOT_BUILT_SETTINGS = new Set([
  "features.extension_import",
  "features.customer_signup",
  "features.ai_agent",
  "features.proposals",
  "features.reports",
  "features.payments",
  "features.sms",
  "features.email",
  "ai.task.customer_chat",
  "ai.task.page_extraction",
  "ai.task.price_extraction",
  "ai.task.negotiation_translation",
  "ai.task.hs_code_suggestion",
  "ai.task.daily_report",
]);
