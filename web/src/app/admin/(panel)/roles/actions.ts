"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { permissions, rolePermissions, roles, userRoles } from "@/db/schema";
import type { FormState } from "@/components/ui/ActionForm";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/can";

export async function createRoleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("roles.manage");
  const key = String(fd.get("key") ?? "").trim().toLowerCase();
  const nameFa = String(fd.get("nameFa") ?? "").trim();
  const nameEn = String(fd.get("nameEn") ?? "").trim() || key;
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(key)) return { error: "کلید فقط حروف کوچک انگلیسی، عدد و _ (مثل senior_expert)." };
  if (!nameFa) return { error: "نام فارسی لازم است." };
  const [dup] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key));
  if (dup) return { error: "این کلید قبلاً وجود دارد." };
  const [r] = await db
    .insert(roles)
    .values({ key, nameFa, nameEn, isStaff: true })
    .returning({ id: roles.id });
  await logActivity({ actorUserId: a.user.id, action: "role.create", entityType: "role", entityId: r.id, after: { key, nameFa } });
  redirect(`/admin/roles/${r.id}`);
}

export async function updateRoleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("roles.manage");
  const id = String(fd.get("id"));
  const [role] = await db.select().from(roles).where(eq(roles.id, id));
  if (!role) return { error: "نقش پیدا نشد." };
  if (role.key === "admin") return { error: "نقش ادمین همیشه همه‌ی دسترسی‌ها را دارد و قابل ویرایش نیست." };

  const nameFa = String(fd.get("nameFa") ?? "").trim();
  if (!nameFa) return { error: "نام فارسی لازم است." };
  const patch = {
    nameFa,
    nameEn: String(fd.get("nameEn") ?? "").trim() || role.nameEn,
    description: String(fd.get("description") ?? "").trim() || null,
    // ویژگی‌های پایه‌ی نقش‌های سیستمی ثابت می‌ماند.
    ...(role.isSystem ? {} : { isStaff: fd.get("isStaff") === "on" }),
  };
  const all = (await db.select({ key: permissions.key }).from(permissions)).map((p) => p.key);
  const selected = fd.getAll("permissions").map(String).filter((k) => all.includes(k));
  const before = (await db.select({ k: rolePermissions.permissionKey }).from(rolePermissions).where(eq(rolePermissions.roleId, id))).map((r) => r.k);

  await db.transaction(async (tx) => {
    await tx.update(roles).set(patch).where(eq(roles.id, id));
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
    if (selected.length) await tx.insert(rolePermissions).values(selected.map((permissionKey) => ({ roleId: id, permissionKey })));
  });
  await logActivity({
    actorUserId: a.user.id,
    action: "role.update",
    entityType: "role",
    entityId: id,
    before: { nameFa: role.nameFa, isStaff: role.isStaff, permissions: before },
    after: { ...patch, permissions: selected },
  });
  revalidatePath(`/admin/roles/${id}`);
  return { ok: "ذخیره شد." };
}

export async function deleteRoleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("roles.manage");
  const id = String(fd.get("id"));
  const [role] = await db.select().from(roles).where(eq(roles.id, id));
  if (!role) return { error: "نقش پیدا نشد." };
  if (role.isSystem) return { error: "نقش سیستمی حذف نمی‌شود." };
  const [{ n }] = await db.select({ n: count() }).from(userRoles).where(eq(userRoles.roleId, id));
  if (n > 0) return { error: "اول این نقش را از کاربرانش بردارید." };
  await db.delete(roles).where(eq(roles.id, id));
  await logActivity({ actorUserId: a.user.id, action: "role.delete", entityType: "role", entityId: id, before: { key: role.key, nameFa: role.nameFa } });
  redirect("/admin/roles");
}
