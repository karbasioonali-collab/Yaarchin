"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { FormState } from "@/components/ui/ActionForm";
import { logActivity } from "@/lib/activity";
import { can, requirePermission } from "@/lib/auth/can";
import { resetUserPassword } from "@/lib/auth/password-reset";
import { RESET_PERMISSION } from "@/lib/auth/password-reset-core";
import { revokeAllSessions } from "@/lib/auth/session";
import { hasCustomerRole } from "@/lib/customer/auth";

// فعال/غیرفعال کردن مشتری (دسترسی customers.manage). غیرفعال: همه‌ی نشست‌هایش بسته می‌شود و دیگر نمی‌تواند وارد شود
// (ورود با رمز و با کد پیامکی هر دو status را چک می‌کنند؛ loadUser در lib/auth/current.ts هم کاربر غیرفعال را نمی‌پذیرد).
export async function setCustomerStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("customers.manage");
  const id = String(fd.get("id") ?? "");
  const status = fd.get("status") === "disabled" ? "disabled" : "active";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(await hasCustomerRole(id))) return { error: "مشتری پیدا نشد." };
  const [before] = await db.select({ status: users.status }).from(users).where(eq(users.id, id));
  if (!before) return { error: "مشتری پیدا نشد." };
  if (before.status === status) return { ok: "بدون تغییر." };

  await db.update(users).set({ status }).where(eq(users.id, id));
  if (status === "disabled") await revokeAllSessions(id);
  await logActivity({
    actorUserId: a.user.id,
    action: status === "disabled" ? "customer.disable" : "customer.enable",
    entityType: "user",
    entityId: id,
    before: { status: before.status },
    after: { status },
  });
  revalidatePath(`/admin/customers/${id}`);
  return { ok: status === "disabled" ? "مشتری غیرفعال شد و از همه‌ی دستگاه‌ها خارج شد." : "مشتری فعال شد." };
}

// تغییر رمز مشتری (بخش ۵۶): مدیر اصلی یا دارنده‌ی customers.reset_password؛ فقط حساب مشتری (بدون هیچ نقش پنلی)، قانون رمز ثبت‌نام مشتری
export async function setCustomerPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("customers.view");
  return resetUserPassword({
    actor: { userId: a.user.id, isAdmin: a.user.isAdmin, sessionId: a.session.id, actingAs: a.session.impersonatingUserId },
    hasPermission: await can(a.user, RESET_PERMISSION),
    targetId: String(fd.get("id") ?? ""),
    expect: "customer",
    password: String(fd.get("password") ?? ""),
    confirm: String(fd.get("passwordConfirm") ?? ""),
  });
}
