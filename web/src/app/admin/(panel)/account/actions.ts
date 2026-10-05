"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { staffNotificationPrefs, users } from "@/db/schema";
import { followupReady } from "@/lib/db-ready";
import type { FormState } from "@/components/ui/ActionForm";
import { logActivity } from "@/lib/activity";
import { requireStaff } from "@/lib/auth/current";
import { hashPassword, passwordError, verifyPassword } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";

export async function changeOwnPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requireStaff();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, a.user.id));
  if (!(await verifyPassword(u?.hash ?? null, current))) return { error: "رمز فعلی درست نیست." };
  const policy = passwordError(next);
  if (policy) return { error: policy };
  if (next === current) return { error: "رمز جدید با رمز فعلی یکی است." };
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, a.user.id));
  await revokeAllSessions(a.user.id, a.session.id);
  await logActivity({ actorUserId: a.user.id, action: "account.change_password", entityType: "user", entityId: a.user.id });
  return { ok: "رمز تغییر کرد. نشست‌های دیگر بسته شدند." };
}

// دریافت پیامک هشدار گفتگو برای خود کاربر (روشن/خاموش). ردیف نبود = روشن. docs/infoyaarchin.md بخش ۲۵.
export async function setOwnSmsAlertsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requireStaff();
  if (!(await followupReady())) return { error: "جدول‌های پیامک هنوز ساخته نشده‌اند؛ در کنسول لیارا npm run db:migrate را اجرا کنید." };
  const on = fd.get("smsEnabled") === "on";
  await db
    .insert(staffNotificationPrefs)
    .values({ userId: a.user.id, smsEnabled: on })
    .onConflictDoUpdate({ target: staffNotificationPrefs.userId, set: { smsEnabled: on, updatedAt: new Date() } });
  await logActivity({ actorUserId: a.user.id, action: "account.sms_alerts", entityType: "user", entityId: a.user.id, after: { smsEnabled: on } });
  return { ok: on ? "پیامک هشدار گفتگو برای شما روشن شد." : "پیامک هشدار گفتگو برای شما خاموش شد." };
}
