import "server-only";
// تنظیمات دستیار هوشمند از متغیرهای محیطی لیارا (کلید هرگز در کد یا دیتابیس نیست). docs/infoyaarchin.md بخش ۲۹.
//   AI_BASE_URL        ← baseUrl پروژه‌ی هوش مصنوعی لیارا (مثل https://ai.liara.ir/api/<id>/v1)
//   AI_API_KEY         ← کلید API همان پروژه
//   AI_MODEL           ← مدل اصلی (پیش‌فرض anthropic/claude-haiku-4.5)
//   AI_FALLBACK_MODEL  ← مدل پشتیبان (اختیاری): اگر مدل اصلی خطا داد یا جواب نداد، یک بار با این مدل.
//                        می‌تواند همان AI_MODEL باشد = یک تلاش دوباره با همان مدل (بخش ۴۷؛ تا PR #44 نادیده گرفته می‌شد)
// هر کدام از AI_BASE_URL یا AI_API_KEY خالی ← «حالت آزمایشی» (مدل ساختگی؛ جواب‌ها فقط در پنل، مشتری مثل قبل به کارشناس).
//   AI_CATALOG_MODEL   ← (اختیاری) مدل «متن فارسی محصول با AI» (بخش ۴۰)؛ خالی = همان AI_MODEL. پشتیبان همان AI_FALLBACK_MODEL.
// مدل جدا برای کارهای دیگر (مثلاً تشخیص لوگو) بعداً با متغیر جدا (مثل AI_LOGO_MODEL)، نه تنظیم پنل.
import { type AiConfig, parseAiEnv } from "./config-core";
export { DEFAULT_MODEL } from "./config-core";

export type { AiConfig } from "./config-core";
export function aiConfig(): AiConfig {
  return parseAiEnv(process.env);
}

// مدل «متن فارسی محصول با AI»: AI_CATALOG_MODEL یا همان مدل اصلی دستیار (بخش ۴۰)
export function catalogModel(cfg: AiConfig): { model: string; fallbackModel: string | null } {
  const model = (process.env.AI_CATALOG_MODEL ?? "").trim() || cfg.model;
  return { model, fallbackModel: cfg.fallbackModel && cfg.fallbackModel !== model ? cfg.fallbackModel : null };
}
