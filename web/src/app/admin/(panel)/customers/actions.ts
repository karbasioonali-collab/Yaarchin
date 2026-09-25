"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { FormState } from "@/components/ui/ActionForm";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/can";
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
