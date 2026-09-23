"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { roles, userRoles, users } from "@/db/schema";
import type { FormState } from "@/components/ui/ActionForm";
import { logActivity } from "@/lib/activity";
import { getAuth } from "@/lib/auth/current";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth/password";
import { isLoginBlocked, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { createSession, destroySession, updateSession } from "@/lib/auth/session";
import { checkTotp, consumeRecoveryCode, regenerateRecoveryCodes } from "@/lib/auth/two-factor";
import { parseIdentifier } from "@/lib/validation";

const GENERIC_ERROR = "موبایل/ایمیل یا رمز اشتباه است.";
const BLOCKED_ERROR = "تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه‌ی دیگر دوباره امتحان کنید.";

// مرحله‌ی اول: موبایل یا ایمیل + رمز
export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const rawId = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const parsed = parseIdentifier(rawId);
  if (!parsed || !password) return { error: GENERIC_ERROR };
  const identifier = parsed.value;

  if (await isLoginBlocked(identifier)) return { error: BLOCKED_ERROR };

  const [user] = await db
    .select()
    .from(users)
    .where(parsed.kind === "mobile" ? eq(users.mobile, identifier) : eq(users.email, identifier));

  if (!user) {
    await burnPasswordCheck(password);
    await recordLoginAttempt({ identifier, step: "password", success: false, reason: "no_user" });
    return { error: GENERIC_ERROR };
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok || user.status !== "active") {
    await recordLoginAttempt({ identifier, userId: user.id, step: "password", success: false, reason: ok ? "disabled" : "bad_password" });
    return { error: GENERIC_ERROR };
  }

  const [staffRole] = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, user.id), eq(roles.isStaff, true)))
    .limit(1);
  if (!staffRole) {
    await recordLoginAttempt({ identifier, userId: user.id, step: "password", success: false, reason: "not_staff" });
    return { error: "این حساب به پنل دسترسی ندارد." };
  }

  await recordLoginAttempt({ identifier, userId: user.id, step: "password", success: true });
  await destroySession();
  await createSession(user.id);

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await logActivity({ actorUserId: user.id, action: "auth.login_password", entityType: "user", entityId: user.id });
  // مرحله‌ی بعد (کد دومرحله‌ای یا راه‌اندازی آن) را requireStaff در /admin تعیین می‌کند.
  redirect("/admin");
}

// مرحله‌ی دوم: کد اپ Authenticator یا کد بازیابی
export async function verifyTwoFactorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const a = await getAuth();
  if (!a) redirect("/admin/login");
  const code = String(formData.get("code") ?? "").trim();
  const mode = formData.get("mode") === "recovery" ? "recovery" : "totp";
  const identifier = a.user.mobile ?? a.user.email ?? a.user.id;

  if (await isLoginBlocked(identifier)) return { error: BLOCKED_ERROR };

  const ok = mode === "recovery" ? await consumeRecoveryCode(a.user.id, code) : await checkTotp(a.user.id, code);
  await recordLoginAttempt({ identifier, userId: a.user.id, step: mode, success: ok, reason: ok ? undefined : "bad_code" });
  if (!ok) return { error: "کد درست نیست." };

  await updateSession(a.session.id, { twoFactorVerifiedAt: new Date() });
  await logActivity({ actorUserId: a.user.id, action: `auth.login_${mode}`, entityType: "user", entityId: a.user.id });
  redirect("/admin");
}

// تأیید اولین کد در راه‌اندازی ورود دومرحله‌ای؛ کدهای بازیابی را برمی‌گرداند.
export async function confirmTwoFactorSetupAction(
  _prev: (FormState & { codes?: string[] }) | null,
  formData: FormData,
): Promise<(FormState & { codes?: string[] }) | null> {
  const a = await getAuth();
  if (!a) redirect("/admin/login");
  if (a.user.totpConfirmed) redirect("/admin");
  const code = String(formData.get("code") ?? "").trim();
  const ok = await checkTotp(a.user.id, code, { confirming: true });
  if (!ok) return { error: "کد درست نیست. ساعت گوشی را هم بررسی کنید." };
  const codes = await regenerateRecoveryCodes(a.user.id);
  await updateSession(a.session.id, { twoFactorVerifiedAt: new Date() });
  await logActivity({ actorUserId: a.user.id, action: "auth.2fa_enabled", entityType: "user", entityId: a.user.id });
  return { ok: "ورود دومرحله‌ای فعال شد.", codes };
}

export async function logoutAction(): Promise<void> {
  const a = await getAuth();
  if (a) await logActivity({ actorUserId: a.user.id, action: "auth.logout", entityType: "user", entityId: a.user.id });
  await destroySession();
  redirect("/admin/login");
}
