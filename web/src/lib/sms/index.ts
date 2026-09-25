import "server-only";

// ارسال پیامک. هنوز هیچ سرویس‌دهنده‌ای (کاوه‌نگار، SMS.ir، ملی‌پیامک، …) وصل نیست.
// اضافه کردن سرویس‌دهنده: یک driver تازه در DRIVERS + متغیر محیطی SMS_PROVIDER و کلیدش در پنل لیارا
// (کلید هرگز در کد نه). تا آن موقع sendSms همیشه no_provider برمی‌گرداند. docs/infoyaarchin.md بخش ۱۸.
export type SmsResult = { ok: true } | { ok: false; error: "no_provider" | "failed" };
type Driver = (to: string, text: string) => Promise<SmsResult>;

const DRIVERS: Record<string, Driver> = {
  // فقط برای توسعه و تست محلی: متن را در لاگ سرور چاپ می‌کند. در production هرگز فعال نمی‌شود.
  console: async (to, text) => {
    console.log(`[sms:console] ${to}: ${text}`);
    return { ok: true };
  },
};

export function smsProviderName(): string | null {
  const name = process.env.SMS_PROVIDER?.trim();
  if (!name || !DRIVERS[name]) return null;
  if (name === "console" && process.env.NODE_ENV === "production") return null;
  return name;
}

export async function sendSms(to: string, text: string): Promise<SmsResult> {
  const name = smsProviderName();
  if (!name) return { ok: false, error: "no_provider" };
  try {
    return await DRIVERS[name](to, text);
  } catch (e) {
    console.error("sms send failed", e);
    return { ok: false, error: "failed" };
  }
}
