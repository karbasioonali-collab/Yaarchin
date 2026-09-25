"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { userRoles, users } from "@/db/schema";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/auth/password";
import { isLoginBlocked, isSignupBlocked, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { customerRoleId, findUserByIdentifier, hasCustomerRole, signInCustomer } from "@/lib/customer/auth";
import { requestOtp, smsLoginAvailable, verifyOtp } from "@/lib/customer/otp";
import { customerPasswordError } from "@/lib/customer/password";
import { isEnabled } from "@/lib/settings";
import { safeNext } from "@/lib/site/safe-next";
import { normalizeMobile, parseIdentifier, toLatinDigits } from "@/lib/validation";

// ورود و ثبت‌نام مشتری در سایت. از همان قطعه‌های ورود پنل استفاده می‌کند:
// شناسه (موبایل یا ایمیل)، هش argon2id، نشست در کوکی yc_session، محدودیت تلاش ناموفق (login_attempts).
// فرق با پنل: رمز حداقل ۸ کاراکتر، نشست طولانی‌تر (auth.customer_session_days) و فقط نقش «مشتری».

export type AuthFormState = { error?: string; ok?: string; step?: "code" } | null;

const GENERIC_ERROR = "موبایل/ایمیل یا رمز اشتباه است.";
const BLOCKED_ERROR = "تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه‌ی دیگر دوباره امتحان کنید.";
const DISABLED_ERROR = "حساب شما غیرفعال شده است. برای پیگیری از صفحه‌ی «تماس با ما» پیام بدهید.";
const STAFF_ERROR = "این حساب مخصوص پنل مدیریت است؛ از /admin/login وارد شوید.";

export async function customerLoginAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const parsed = parseIdentifier(String(fd.get("identifier") ?? "").trim());
  const password = String(fd.get("password") ?? "");
  if (!parsed || !password) return { error: GENERIC_ERROR };
  const identifier = parsed.value;
  if (await isLoginBlocked(identifier)) return { error: BLOCKED_ERROR };

  const user = await findUserByIdentifier(parsed);
  if (!user) {
    await burnPasswordCheck(password);
    await recordLoginAttempt({ identifier, step: "password", success: false, reason: "no_user" });
    return { error: GENERIC_ERROR };
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    await recordLoginAttempt({ identifier, userId: user.id, step: "password", success: false, reason: "bad_password" });
    return { error: GENERIC_ERROR };
  }
  // از اینجا رمز درست است؛ پس گفتن دلیل دقیق چیزی را به غریبه لو نمی‌دهد.
  if (user.status !== "active") {
    await recordLoginAttempt({ identifier, userId: user.id, step: "password", success: false, reason: "disabled" });
    return { error: DISABLED_ERROR };
  }
  if (!(await hasCustomerRole(user.id))) {
    await recordLoginAttempt({ identifier, userId: user.id, step: "password", success: false, reason: "not_customer" });
    return { error: STAFF_ERROR };
  }

  await recordLoginAttempt({ identifier, userId: user.id, step: "password", success: true });
  await signInCustomer(user.id, "password");
  redirect(safeNext(fd.get("next")));
}

export async function customerSignupAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  // فیلد مخفی ضد ربات (مثل فرم تماس)
  if (String(fd.get("website") ?? "").trim()) return { error: "ثبت‌نام انجام نشد؛ دوباره تلاش کنید." };
  if (!(await isEnabled("customer_signup"))) return { error: "ثبت‌نام فعلاً بسته است." };

  const fullName = String(fd.get("fullName") ?? "").trim().replace(/\s+/g, " ");
  const parsed = parseIdentifier(String(fd.get("identifier") ?? "").trim());
  const password = String(fd.get("password") ?? "");
  if (fullName.length < 2 || fullName.length > 80) return { error: "نام و نام خانوادگی را وارد کنید (۲ تا ۸۰ حرف)." };
  if (!parsed) return { error: "یک شماره موبایل معتبر (مثل ۰۹۱۲۱۲۳۴۵۶۷) یا ایمیل وارد کنید." };
  const pwError = customerPasswordError(password);
  if (pwError) return { error: pwError };

  if (await isSignupBlocked()) return { error: "تعداد ثبت‌نام از این اینترنت زیاد بود. یک ساعت دیگر دوباره امتحان کنید." };
  const identifier = parsed.value;
  if (await findUserByIdentifier(parsed)) {
    await recordLoginAttempt({ identifier, step: "signup", success: false, reason: "exists" });
    return { error: parsed.kind === "mobile" ? "این موبایل قبلاً ثبت شده؛ وارد شوید." : "این ایمیل قبلاً ثبت شده؛ وارد شوید." };
  }
  const roleId = await customerRoleId();
  if (!roleId) return { error: "ثبت‌نام موقتاً ممکن نیست؛ کمی بعد دوباره تلاش کنید." };

  const passwordHash = await hashPassword(password);
  let userId: string;
  try {
    userId = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          fullName,
          mobile: parsed.kind === "mobile" ? identifier : null,
          email: parsed.kind === "email" ? identifier : null,
          passwordHash,
        })
        .returning({ id: users.id });
      await tx.insert(userRoles).values({ userId: u.id, roleId });
      return u.id;
    });
  } catch (e) {
    // دو ثبت‌نام هم‌زمان با یک شناسه: ایندکس یکتا دومی را رد می‌کند
    if ((e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505") {
      return { error: "این موبایل یا ایمیل قبلاً ثبت شده؛ وارد شوید." };
    }
    throw e;
  }
  await recordLoginAttempt({ identifier, userId, step: "signup", success: true });
  await signInCustomer(userId, "signup");
  redirect(safeNext(fd.get("next")));
}

// ---------- ورود با کد پیامکی (فقط با سوئیچ features.sms) ----------
// برای اینکه معلوم نشود کدام موبایل حساب دارد، جواب درخواست کد برای همه یکسان است.
export async function requestSmsCodeAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  if (!(await smsLoginAvailable())) return { error: "ورود با کد پیامکی فعلاً فعال نیست." };
  const mobile = normalizeMobile(String(fd.get("mobile") ?? ""));
  if (!mobile) return { error: "یک شماره موبایل معتبر وارد کنید (مثل ۰۹۱۲۱۲۳۴۵۶۷)." };
  if (await isLoginBlocked(mobile)) return { error: BLOCKED_ERROR };
  const user = await findUserByIdentifier({ kind: "mobile", value: mobile });
  if (user && user.status === "active" && (await hasCustomerRole(user.id))) {
    const r = await requestOtp(mobile, "login");
    if (!r.ok) return { error: r.error };
  }
  return { ok: "اگر حسابی با این موبایل باشد، کد ۶ رقمی برایش پیامک شد.", step: "code" };
}

export async function smsLoginAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  if (!(await smsLoginAvailable())) return { error: "ورود با کد پیامکی فعلاً فعال نیست." };
  const mobile = normalizeMobile(String(fd.get("mobile") ?? ""));
  const code = toLatinDigits(String(fd.get("code") ?? "")).trim();
  if (!mobile) return { error: "یک شماره موبایل معتبر وارد کنید.", step: "code" };
  if (await isLoginBlocked(mobile)) return { error: BLOCKED_ERROR, step: "code" };
  const user = await findUserByIdentifier({ kind: "mobile", value: mobile });
  const ok = await verifyOtp(mobile, "login", code);
  if (!ok || !user || user.status !== "active" || !(await hasCustomerRole(user.id))) {
    await recordLoginAttempt({ identifier: mobile, userId: user?.id, step: "sms", success: false, reason: ok ? "not_allowed" : "bad_code" });
    return { error: "کد درست نیست یا منقضی شده است.", step: "code" };
  }
  await recordLoginAttempt({ identifier: mobile, userId: user.id, step: "sms", success: true });
  // ورود با کد یعنی موبایل تأیید شد
  if (!user.mobileVerifiedAt) {
    await db.update(users).set({ mobileVerifiedAt: new Date() }).where(eq(users.id, user.id));
  }
  await signInCustomer(user.id, "sms");
  redirect(safeNext(fd.get("next")));
}
