import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { otpCodes } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { customerReady } from "@/lib/db-ready";
import { requestMeta } from "@/lib/request";
import { isEnabled } from "@/lib/settings";
import { sendSms, smsProviderName } from "@/lib/sms";

// کد یک‌بارمصرف پیامکی برای ورود مشتری. فقط وقتی سوئیچ features.sms روشن است کار می‌کند.
// - کد ۶ رقمی، اعتبار ۲ دقیقه، حداکثر ۵ بار تلاش برای هر کد؛ فقط هش کد (همراه شناسه‌ی ردیف) ذخیره می‌شود.
// - محدودیت ارسال: هر موبایل یک کد در ۶۰ ثانیه و ۵ کد در ساعت؛ هر IP ۲۰ کد در ساعت.
const CODE_TTL_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_MS = 60 * 1000;
const MAX_PER_MOBILE_HOUR = 5;
const MAX_PER_IP_HOUR = 20;

export type OtpPurpose = "login" | "verify";

// سوئیچ روشن + سرویس‌دهنده‌ی پیامک وصل + migration ۰۰۰۳ اجرا شده. تا یکی نباشد، گزینه‌ی کد پیامکی دیده نمی‌شود.
export async function smsLoginAvailable(): Promise<boolean> {
  return !!smsProviderName() && (await isEnabled("sms")) && (await customerReady());
}

const codeHash = (rowId: string, code: string) => sha256Hex(`${rowId}:${code}`);

export async function requestOtp(mobile: string, purpose: OtpPurpose): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await smsLoginAvailable())) return { ok: false, error: "ورود با کد پیامکی فعلاً فعال نیست." };
  const { ip } = await requestMeta();
  const hourAgo = new Date(Date.now() - 3600 * 1000);
  const [[last], [perMobile], [perIp]] = await Promise.all([
    db
      .select({ at: otpCodes.createdAt })
      .from(otpCodes)
      .where(eq(otpCodes.identifier, mobile))
      .orderBy(desc(otpCodes.createdAt))
      .limit(1),
    db.select({ n: count() }).from(otpCodes).where(and(eq(otpCodes.identifier, mobile), gt(otpCodes.createdAt, hourAgo))),
    ip
      ? db.select({ n: count() }).from(otpCodes).where(and(eq(otpCodes.ip, ip), gt(otpCodes.createdAt, hourAgo)))
      : Promise.resolve([{ n: 0 }]),
  ]);
  if (last && Date.now() - last.at.getTime() < RESEND_MS) return { ok: false, error: "یک دقیقه صبر کنید و دوباره درخواست کد بدهید." };
  if (perMobile.n >= MAX_PER_MOBILE_HOUR || perIp.n >= MAX_PER_IP_HOUR) {
    return { ok: false, error: "درخواست کد زیاد بود. یک ساعت دیگر دوباره امتحان کنید." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const [row] = await db
    .insert(otpCodes)
    .values({ identifier: mobile, purpose, codeHash: "pending", expiresAt: new Date(Date.now() + CODE_TTL_MS), ip })
    .returning({ id: otpCodes.id });
  await db.update(otpCodes).set({ codeHash: codeHash(row.id, code) }).where(eq(otpCodes.id, row.id));
  const sent = await sendSms(mobile, `کد ورود یارچین: ${code}\nاین کد را به کسی ندهید.`);
  if (!sent.ok) {
    await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, row.id));
    return { ok: false, error: "ارسال پیامک ممکن نشد. با رمز عبور وارد شوید." };
  }
  return { ok: true };
}

// بررسی کد: فقط آخرین کد مصرف‌نشده و منقضی‌نشده‌ی این موبایل. هر تلاش شمرده می‌شود.
export async function verifyOtp(mobile: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  if (!(await smsLoginAvailable()) || !/^\d{6}$/.test(code)) return false;
  const [row] = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.identifier, mobile),
        eq(otpCodes.purpose, purpose),
        isNull(otpCodes.consumedAt),
        gt(otpCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (!row || row.attempts >= MAX_ATTEMPTS) return false;
  // شمارش تلاش و مصرف کد به‌صورت اتمی (دو درخواست هم‌زمان نمی‌توانند یک کد را دو بار مصرف کنند)
  const ok = timingSafeEqual(Buffer.from(codeHash(row.id, code)), Buffer.from(row.codeHash.padEnd(64, "0").slice(0, 64)));
  const [updated] = await db
    .update(otpCodes)
    .set({ attempts: sql`${otpCodes.attempts} + 1`, ...(ok ? { consumedAt: new Date() } : {}) })
    .where(and(eq(otpCodes.id, row.id), isNull(otpCodes.consumedAt), sql`${otpCodes.attempts} < ${MAX_ATTEMPTS}`))
    .returning({ id: otpCodes.id });
  return ok && !!updated;
}
