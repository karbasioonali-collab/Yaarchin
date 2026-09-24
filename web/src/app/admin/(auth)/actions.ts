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
import { createSession, destroySession } from "@/lib/auth/session";
import { parseIdentifier } from "@/lib/validation";

const GENERIC_ERROR = "موبایل/ایمیل یا رمز اشتباه است.";
const BLOCKED_ERROR = "تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه‌ی دیگر دوباره امتحان کنید.";

// ورود: موبایل یا ایمیل + رمز
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
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const a = await getAuth();
  if (a) await logActivity({ actorUserId: a.user.id, action: "auth.logout", entityType: "user", entityId: a.user.id });
  await destroySession();
  redirect("/admin/login");
}
