import "server-only";
import { db } from "@/db/client";
import { smsOutbox } from "@/db/schema";
import { followupReady } from "@/lib/db-ready";

// ارسال پیامک. هنوز هیچ سرویس‌دهنده‌ای (کاوه‌نگار، SMS.ir، ملی‌پیامک، …) وصل نیست.
// اضافه کردن سرویس‌دهنده: یک driver تازه در DRIVERS + متغیر محیطی SMS_PROVIDER و کلیدش در پنل لیارا
// (کلید هرگز در کد نه). docs/infoyaarchin.md بخش ۱۸ و ۲۵.
//
// «حالت آزمایشی» (قاعده‌ی پروژه برای هر سرویس پولی): تا SMS_PROVIDER تنظیم نشده، هر پیامک فقط در جدول sms_outbox با
// وضعیت test ثبت می‌شود و در پنل ← «پیامک‌های ارسالی» دیده می‌شود. با تنظیم SMS_PROVIDER، بدون تغییر کد واقعی می‌شود.
// همه‌ی پیامک‌ها (واقعی یا آزمایشی) در sms_outbox ثبت می‌شوند (بعد از migration ۰۰۰۷)؛ متن کد ورود پوشانده ذخیره می‌شود.
export type SmsResult = { ok: true; test?: boolean } | { ok: false; error: "no_provider" | "failed" };
type Driver = (to: string, text: string) => Promise<SmsResult>;
export type SmsMeta = { kind: string; userId?: string | null; conversationId?: string | null };

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

// کد ورود هرگز در صف ذخیره نمی‌شود (هر عدد ۴ رقمی یا بیشتر پوشانده می‌شود)
const stored = (meta: SmsMeta, text: string) => (meta.kind === "otp" ? text.replace(/\d{4,}/g, "••••••") : text);

async function record(to: string, text: string, meta: SmsMeta, status: "test" | "sent" | "failed" | "skipped", provider: string | null, error: string | null) {
  if (!(await followupReady())) return;
  try {
    await db.insert(smsOutbox).values({ toMobile: to, userId: meta.userId ?? null, kind: meta.kind, body: stored(meta, text), status, provider, error, conversationId: meta.conversationId ?? null });
  } catch (e) {
    console.error("sms outbox insert failed", e);
  }
}

// meta نداده = مثل قبل (ورود پیامکی بخش ۱۸): بدون سرویس‌دهنده no_provider برمی‌گردد و چیزی ثبت نمی‌شود.
// meta داده = هشدارهای پنل: بدون سرویس‌دهنده با وضعیت test ثبت و ok برمی‌گردد (حالت آزمایشی).
export async function sendSms(to: string, text: string, meta?: SmsMeta): Promise<SmsResult> {
  const name = smsProviderName();
  if (!name) {
    if (!meta) return { ok: false, error: "no_provider" };
    await record(to, text, meta, "test", null, null);
    return { ok: true, test: true };
  }
  let r: SmsResult;
  try {
    r = await DRIVERS[name](to, text);
  } catch (e) {
    console.error("sms send failed", e);
    r = { ok: false, error: "failed" };
  }
  await record(to, text, meta ?? { kind: "otp" }, r.ok ? "sent" : "failed", name, r.ok ? null : r.error);
  return r;
}

// پیامکی که طبق قاعده فرستاده نشد (خارج از ساعت کاری، …) هم ثبت می‌شود تا در پنل معلوم باشد چرا نرسید
export async function recordSkippedSms(to: string, text: string, meta: SmsMeta, reason: string): Promise<void> {
  await record(to, text, meta, "skipped", smsProviderName(), reason);
}
