import "server-only";
// تغییر رمز کاربر از پنل (بخش ۵۶): یک مسیر مشترک برای صفحه‌ی «کاربران» (کارمند) و «مشتریان» (مشتری).
// بعد از تغییر: همه‌ی نشست‌های آن کاربر بسته می‌شود (اگر کاربر خودش است، نشست فعلی‌اش می‌ماند) و قفل موقت ورودش
// (تلاش‌های ناموفق ۱۵ دقیقه‌ی اخیر با موبایل یا ایمیلش) پاک می‌شود. لاگ فعالیت: چه کسی، رمز چه کسی؛ خود رمز هرگز.
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { loginAttempts, roles, userRoles, users } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { hashPassword } from "./password";
import { RESET_MSG, resetAllowed, resetPasswordError, type ResetTarget } from "./password-reset-core";
import { revokeAllSessions } from "./session";

// نوع کاربر: هر نقش پنلی (is_staff) ← staff؛ وگرنه customer. null = کاربر نیست
export async function resetTargetOf(userId: string): Promise<ResetTarget | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!u) return null;
  const [s] = await db
    .select({ one: sql<number>`1` })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), eq(roles.isStaff, true)))
    .limit(1);
  return s ? "staff" : "customer";
}

export async function resetUserPassword(o: {
  actor: { userId: string; isAdmin: boolean; sessionId: string; actingAs: string | null };
  hasPermission: boolean;
  targetId: string;
  expect: ResetTarget;
  password: string;
  confirm: string;
}): Promise<{ ok: string } | { error: string }> {
  const target = await resetTargetOf(o.targetId);
  if (!target) return { error: RESET_MSG.notFound };
  // صفحه‌ی مشتری فقط مشتری؛ صفحه‌ی کاربران فقط کارمند (حتی اگر فرم دستکاری شود)
  if (target !== o.expect) return { error: target === "staff" ? RESET_MSG.notCustomer : "این حساب مشتری است؛ رمزش از بخش «مشتریان» عوض می‌شود." };
  const denied = resetAllowed(target, o.actor.isAdmin, o.hasPermission);
  if (denied) return { error: denied };
  const bad = resetPasswordError(target, o.password, o.confirm);
  if (bad) return { error: bad };

  const [u] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(o.password) })
    .where(eq(users.id, o.targetId))
    .returning({ email: users.email, mobile: users.mobile });
  const self = o.targetId === o.actor.userId;
  await revokeAllSessions(o.targetId, self ? o.actor.sessionId : undefined);
  // قفل موقت ورود: تلاش‌های ناموفق با همین کاربر یا موبایل/ایمیلش
  const ids = [u?.email, u?.mobile].filter((x): x is string => !!x);
  await db
    .delete(loginAttempts)
    .where(
      and(eq(loginAttempts.success, false), ids.length ? or(eq(loginAttempts.userId, o.targetId), inArray(loginAttempts.identifier, ids)) : eq(loginAttempts.userId, o.targetId)),
    );
  await logActivity({
    actorUserId: o.actor.userId,
    actingAsUserId: o.actor.actingAs,
    action: target === "customer" ? "customer.set_password" : "user.set_password",
    entityType: "user",
    entityId: o.targetId,
    after: { sessionsClosed: true, keptOwnSession: self },
  });
  return { ok: self ? "رمز تغییر کرد. نشست‌های دیگر شما بسته شدند؛ این نشست می‌ماند." : "رمز تغییر کرد و همه‌ی نشست‌های این کاربر بسته شدند." };
}
