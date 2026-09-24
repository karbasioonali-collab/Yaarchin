import "server-only";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import { rolePermissions, roles, userRoles, users } from "@/db/schema";
import { readSession, type SessionRow } from "./session";

export type RoleInfo = { id: string; key: string; nameFa: string; isStaff: boolean };

export type CurrentUser = {
  id: string;
  fullName: string;
  mobile: string | null;
  email: string | null;
  roles: RoleInfo[];
  permissions: Set<string>;
  isAdmin: boolean;
  isStaff: boolean;
};

export type AuthState = {
  session: SessionRow;
  user: CurrentUser;
  // کاربری که ادمین «به‌جای» او می‌بیند (در غیر این صورت null)
  impersonating: { id: string; fullName: string } | null;
};

async function loadUser(userId: string): Promise<CurrentUser | null> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || u.status !== "active") return null;
  const rs = await db
    .select({ id: roles.id, key: roles.key, nameFa: roles.nameFa, isStaff: roles.isStaff })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  const perms = rs.length
    ? await db
        .select({ key: rolePermissions.permissionKey })
        .from(rolePermissions)
        .where(inArray(rolePermissions.roleId, rs.map((r) => r.id)))
    : [];
  return {
    id: u.id,
    fullName: u.fullName,
    mobile: u.mobile,
    email: u.email,
    roles: rs,
    permissions: new Set(perms.map((p) => p.key)),
    isAdmin: rs.some((r) => r.key === "admin"),
    isStaff: rs.some((r) => r.isStaff),
  };
}

// وضعیت ورود در این درخواست (یک‌بار در هر درخواست محاسبه می‌شود).
export const getAuth = cache(async (): Promise<AuthState | null> => {
  const session = await readSession();
  if (!session) return null;
  const user = await loadUser(session.userId);
  if (!user) return null;
  let impersonating: AuthState["impersonating"] = null;
  if (session.impersonatingUserId) {
    const [t] = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, session.impersonatingUserId));
    impersonating = t ?? null;
  }
  return { session, user, impersonating };
});

// برای همه‌ی صفحه‌ها و actionهای پنل: فقط کاربر واردشده‌ی فعال با نقش پنل (ادمین/کارشناس).
// (ورود دومرحله‌ای به درخواست مالک حذف شد؛ docs/infoyaarchin.md بخش ۱۳.)
export async function requireStaff(): Promise<AuthState> {
  const a = await getAuth();
  if (!a || !a.user.isStaff) redirect("/admin/login");
  return a;
}
