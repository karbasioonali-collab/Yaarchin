import "server-only";
import { redirect } from "next/navigation";
import { getSetting } from "@/lib/settings";
import { requireStaff, type AuthState, type CurrentUser } from "./current";

/**
 * تابع مرکزی «کاربر اجازه دارد؟» — همه‌ی صفحه‌ها و APIها فقط از این استفاده کنند.
 *
 * - ادمین همیشه اجازه دارد.
 * - تا وقتی سوئیچ auth.enforce_permissions خاموش است، هر کاربر پنل اجازه دارد (اصل ۹).
 * - با روشن‌شدن سوئیچ، فقط دسترسی‌های نقش‌های کاربر حساب می‌شود.
 * - resource برای آینده است (مثلاً «فقط مشتری‌های خودش»).
 */
export async function can(user: CurrentUser, permission: string, resource?: unknown): Promise<boolean> {
  void resource;
  if (user.isAdmin) return true;
  if (!user.isStaff) return false;
  const enforce = await getSetting<boolean>("auth.enforce_permissions");
  if (!enforce) return true;
  return user.permissions.has(permission);
}

// ورود کامل پنل + دسترسی؛ در غیر این صورت صفحه‌ی «دسترسی ندارید».
export async function requirePermission(permission: string): Promise<AuthState> {
  const a = await requireStaff();
  if (!(await can(a.user, permission))) redirect("/admin/forbidden");
  return a;
}

// یکی از چند دسترسی کافی است (مثلاً فهرست محصولات: products.rate یا products.manage)
export async function canAny(user: CurrentUser, permissions: string[]): Promise<boolean> {
  for (const p of permissions) if (await can(user, p)) return true;
  return false;
}

export async function requireAnyPermission(permissions: string[]): Promise<AuthState> {
  const a = await requireStaff();
  if (!(await canAny(a.user, permissions))) redirect("/admin/forbidden");
  return a;
}
