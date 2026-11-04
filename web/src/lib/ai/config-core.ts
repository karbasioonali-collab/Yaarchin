// خواندن متغیرهای دستیار از env (خالص؛ تست واحد مستقیم اجرایش می‌کند). config.ts همین را با process.env صدا می‌زند.
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

export function parseAiEnv(env: Record<string, string | undefined>): AiConfig {
  const baseUrl = validBase(env.AI_BASE_URL ?? "");
  const apiKey = (env.AI_API_KEY ?? "").trim() || null;
  const model = (env.AI_MODEL ?? "").trim() || DEFAULT_MODEL;
  // پشتیبان می‌تواند همان مدل اصلی باشد: یعنی اگر مدل اصلی دیر کرد یا خطا داد، یک بار دوباره با همان مدل (بخش ۴۷).
  // (تا PR #44 پشتیبانِ برابر با مدل اصلی نادیده گرفته می‌شد.)
  const fallbackModel = (env.AI_FALLBACK_MODEL ?? "").trim() || null;
  return { mode: baseUrl && apiKey ? "live" : "test", baseUrl, apiKey, model, fallbackModel };
}
