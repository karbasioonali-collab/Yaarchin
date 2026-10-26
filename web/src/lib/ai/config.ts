import "server-only";
// تنظیمات دستیار هوشمند از متغیرهای محیطی لیارا (کلید هرگز در کد یا دیتابیس نیست). docs/infoyaarchin.md بخش ۲۹.
//   AI_BASE_URL        ← baseUrl پروژه‌ی هوش مصنوعی لیارا (مثل https://ai.liara.ir/api/<id>/v1)
//   AI_API_KEY         ← کلید API همان پروژه
//   AI_MODEL           ← مدل اصلی (پیش‌فرض anthropic/claude-haiku-4.5)
//   AI_FALLBACK_MODEL  ← مدل پشتیبان (اختیاری): اگر مدل اصلی خطا داد یا جواب نداد، یک بار با این مدل
// هر کدام از AI_BASE_URL یا AI_API_KEY خالی ← «حالت آزمایشی» (مدل ساختگی؛ جواب‌ها فقط در پنل، مشتری مثل قبل به کارشناس).
// مدل جدا برای کارهای دیگر (مثلاً تشخیص لوگو) بعداً با متغیر جدا (مثل AI_LOGO_MODEL)، نه تنظیم پنل.
export const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

export type AiConfig = { mode: "live" | "test"; baseUrl: string | null; apiKey: string | null; model: string; fallbackModel: string | null };

function validBase(raw: string): string | null {
  const s = raw.trim().replace(/\/+$/, "");
  if (!s) return null;
  try {
    const u = new URL(s);
    // http فقط برای سرور ساختگی تست محلی
    if (u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost"))) return s;
  } catch {}
  console.warn("AI_BASE_URL نامعتبر است و نادیده گرفته شد.");
  return null;
}

export function aiConfig(): AiConfig {
  const baseUrl = validBase(process.env.AI_BASE_URL ?? "");
  const apiKey = (process.env.AI_API_KEY ?? "").trim() || null;
  const model = (process.env.AI_MODEL ?? "").trim() || DEFAULT_MODEL;
  const fallbackModel = (process.env.AI_FALLBACK_MODEL ?? "").trim() || null;
  return { mode: baseUrl && apiKey ? "live" : "test", baseUrl, apiKey, model, fallbackModel: fallbackModel === model ? null : fallbackModel };
}
