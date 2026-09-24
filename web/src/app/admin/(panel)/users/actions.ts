"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { roles, userRoles, users } from "@/db/schema";
import type { FormState } from "@/components/ui/ActionForm";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/can";
import { hashPassword, passwordError } from "@/lib/auth/password";
import { revokeAllSessions, updateSession } from "@/lib/auth/session";
import { normalizeEmail, normalizeMobile } from "@/lib/validation";

type Profile = { fullName: string; mobile: string | null; email: string | null };

function readProfile(fd: FormData): Profile | { error: string } {
  const fullName = String(fd.get("fullName") ?? "").trim();
  const mobileRaw = String(fd.get("mobile") ?? "").trim();
  const emailRaw = String(fd.get("email") ?? "").trim();
  if (fullName.length < 2) return { error: "نام را وارد کنید." };
  const mobile = mobileRaw ? normalizeMobile(mobileRaw) : null;
  if (mobileRaw && !mobile) return { error: "موبایل معتبر نیست (مثل ۰۹۱۲۱۲۳۴۵۶۷)." };
  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  if (emailRaw && !email) return { error: "ایمیل معتبر نیست." };
  if (!mobile && !email) return { error: "موبایل یا ایمیل لازم است." };
  return { fullName, mobile, email };
}

async function duplicateError(p: Profile, exceptId?: string): Promise<string | null> {
  const not = exceptId ? ne(users.id, exceptId) : undefined;
  if (p.mobile) {
    const [d] = await db.select({ id: users.id }).from(users).where(and(eq(users.mobile, p.mobile), not));
    if (d) return "این موبایل قبلاً ثبت شده.";
  }
  if (p.email) {
    const [d] = await db.select({ id: users.id }).from(users).where(and(sql`lower(${users.email}) = ${p.email}`, not));
    if (d) return "این ایمیل قبلاً ثبت شده.";
  }
  return null;
}

async function readRoleIds(fd: FormData): Promise<string[]> {
  const ids = fd.getAll("roles").map(String).filter(Boolean);
  if (!ids.length) return [];
  const valid = await db.select({ id: roles.id }).from(roles).where(inArray(roles.id, ids));
  return valid.map((r) => r.id);
}

export async function createUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("users.manage");
  const p = readProfile(fd);
  if ("error" in p) return p;
  const dup = await duplicateError(p);
  if (dup) return { error: dup };
  const password = String(fd.get("password") ?? "");
  const roleIds = await readRoleIds(fd);
  // ادمین و کارشناس فقط با رمز وارد می‌شوند؛ پس برای نقش‌های پنل رمز اجباری است.
  const staffRoles = roleIds.length
    ? await db.select({ id: roles.id }).from(roles).where(and(inArray(roles.id, roleIds), eq(roles.isStaff, true)))
    : [];
  if (staffRoles.length && !password) return { error: "برای ادمین و کارشناس، رمز عبور لازم است." };
  if (password) {
    const policy = passwordError(password);
    if (policy) return { error: policy };
  }

  const [created] = await db
    .insert(users)
    .values({ ...p, passwordHash: password ? await hashPassword(password) : null })
    .returning({ id: users.id });
  if (roleIds.length) {
    await db.insert(userRoles).values(roleIds.map((roleId) => ({ userId: created.id, roleId, grantedBy: a.user.id })));
  }
  await logActivity({ actorUserId: a.user.id, action: "user.create", entityType: "user", entityId: created.id, after: { ...p, roleIds } });
  redirect(`/admin/users/${created.id}`);
}

export async function updateUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("users.manage");
  const id = String(fd.get("id"));
  const [before] = await db.select().from(users).where(eq(users.id, id));
  if (!before) return { error: "کاربر پیدا نشد." };
  const p = readProfile(fd);
  if ("error" in p) return p;
  const dup = await duplicateError(p, id);
  if (dup) return { error: dup };
  const status = fd.get("status") === "disabled" ? "disabled" : "active";
  if (id === a.user.id && status === "disabled") return { error: "نمی‌توانید حساب خودتان را غیرفعال کنید." };

  const roleIds = await readRoleIds(fd);
  const beforeRoles = (await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, id))).map((r) => r.roleId);

  // جلوگیری از حذف آخرین ادمین
  const [adminRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "admin"));
  if (adminRole && beforeRoles.includes(adminRole.id) && (!roleIds.includes(adminRole.id) || status === "disabled")) {
    const admins = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(eq(userRoles.roleId, adminRole.id), eq(users.status, "active")));
    if (admins.length <= 1) return { error: "این آخرین ادمین فعال است؛ نقش ادمین یا فعال بودنش را نمی‌شود برداشت." };
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ ...p, status }).where(eq(users.id, id));
    const toRemove = beforeRoles.filter((r) => !roleIds.includes(r));
    const toAdd = roleIds.filter((r) => !beforeRoles.includes(r));
    if (toRemove.length) await tx.delete(userRoles).where(and(eq(userRoles.userId, id), inArray(userRoles.roleId, toRemove)));
    if (toAdd.length) await tx.insert(userRoles).values(toAdd.map((roleId) => ({ userId: id, roleId, grantedBy: a.user.id })));
  });
  if (status === "disabled") await revokeAllSessions(id);

  await logActivity({
    actorUserId: a.user.id,
    action: "user.update",
    entityType: "user",
    entityId: id,
    before: { fullName: before.fullName, mobile: before.mobile, email: before.email, status: before.status, roleIds: beforeRoles },
    after: { ...p, status, roleIds },
  });
  revalidatePath(`/admin/users/${id}`);
  return { ok: "ذخیره شد." };
}

export async function setPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("users.manage");
  const id = String(fd.get("id"));
  const password = String(fd.get("password") ?? "");
  const policy = passwordError(password);
  if (policy) return { error: policy };
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, id));
  await revokeAllSessions(id, id === a.user.id ? a.session.id : undefined);
  await logActivity({ actorUserId: a.user.id, action: "user.set_password", entityType: "user", entityId: id });
  return { ok: "رمز تغییر کرد و نشست‌های دیگر این کاربر بسته شدند." };
}

export async function revokeSessionsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("users.manage");
  const id = String(fd.get("id"));
  await revokeAllSessions(id, id === a.user.id ? a.session.id : undefined);
  await logActivity({ actorUserId: a.user.id, action: "user.revoke_sessions", entityType: "user", entityId: id });
  return { ok: "همه‌ی نشست‌ها بسته شدند." };
}

// ادمین سایت را «به‌جای مشتری» می‌بیند. فقط برای کاربرانی که نقش پنل ندارند.
export async function startImpersonationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("impersonate");
  const id = String(fd.get("id"));
  const staff = await db
    .select({ id: roles.id })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, id), eq(roles.isStaff, true)));
  if (staff.length) return { error: "فقط برای مشتری‌ها امکان‌پذیر است." };
  await updateSession(a.session.id, { impersonatingUserId: id });
  await logActivity({ actorUserId: a.user.id, actingAsUserId: id, action: "impersonate.start", entityType: "user", entityId: id });
  revalidatePath("/admin", "layout");
  return { ok: "فعال شد. تا زمان «پایان»، بخش‌های مشتری (از مرحله‌ی ۵) با این کاربر نمایش داده می‌شوند." };
}

export async function stopImpersonationAction(): Promise<void> {
  const a = await requirePermission("impersonate");
  if (a.session.impersonatingUserId) {
    await logActivity({
      actorUserId: a.user.id,
      actingAsUserId: a.session.impersonatingUserId,
      action: "impersonate.stop",
      entityType: "user",
      entityId: a.session.impersonatingUserId,
    });
  }
  await updateSession(a.session.id, { impersonatingUserId: null });
  revalidatePath("/admin", "layout");
}
