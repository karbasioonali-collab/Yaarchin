import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { roles, userRoles } from "@/db/schema";

// قانون‌های «فقط ادمین» (docs/infoyaarchin.md بخش ۱۷).
// این‌ها جدا از can() هستند و با هیچ دسترسی یا سوئیچی باز نمی‌شوند؛ حتی وقتی auth.enforce_permissions خاموش است
// و can() به همه‌ی کاربران پنل «بله» می‌گوید. بدون این‌ها، کارشناس می‌توانست به خودش نقش ادمین بدهد
// یا رمز یک ادمین را عوض کند و با حساب او وارد شود.
export const ADMIN_ONLY_MSG = {
  grantAdmin: "فقط ادمین می‌تواند نقش ادمین بدهد یا بگیرد.",
  editAdmin: "فقط ادمین می‌تواند حساب یک ادمین را ویرایش کند (مشخصات، رمز، وضعیت یا نشست‌ها).",
  roles: "فقط ادمین می‌تواند نقش‌ها و دسترسی‌هایشان را بسازد، تغییر دهد یا حذف کند.",
  setting: "فقط ادمین می‌تواند این تنظیم را تغییر دهد.",
} as const;

// تنظیم‌هایی که فقط ادمین عوض می‌کند (بقیه با دسترسی settings.manage)
export const ADMIN_ONLY_SETTINGS = new Set(["auth.enforce_permissions"]);

export async function adminRoleId(): Promise<string | null> {
  const [r] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "admin"));
  return r?.id ?? null;
}

// آیا این کاربر نقش ادمین دارد؟ (فعال بودن مهم نیست: حساب غیرفعالِ ادمین هم فقط دست ادمین است)
export async function isAdminUser(userId: string): Promise<boolean> {
  const adminId = await adminRoleId();
  if (!adminId) return false;
  const [r] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, adminId)));
  return !!r;
}
