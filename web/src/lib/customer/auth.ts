import "server-only";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { roles, userRoles, users } from "@/db/schema";
import { type AuthState, type CurrentUser, getAuth } from "@/lib/auth/current";
import { createSession, destroySession } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";
import { trackEvent } from "./events";

// مشتری = کاربری با نقش customer و بدون هیچ نقش کارمندی. به پنل دسترسی ندارد (requireStaff رد می‌کند).
export function isCustomer(user: CurrentUser): boolean {
  return !user.isStaff && user.roles.some((r) => r.key === "customer");
}

// مشتری واردشده‌ی این درخواست، یا null
export async function getCustomer(): Promise<AuthState | null> {
  const a = await getAuth();
  return a && isCustomer(a.user) ? a : null;
}

// صفحه‌های پنل مشتری: واردنشده ← صفحه‌ی ورود و بعد برگشت به همین صفحه
export async function requireCustomer(backTo: string): Promise<AuthState> {
  const a = await getCustomer();
  if (!a) redirect(`/login?next=${encodeURIComponent(backTo)}`);
  return a;
}

export async function customerRoleId(): Promise<string | null> {
  const [r] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "customer"));
  return r?.id ?? null;
}

// کاربر با موبایل یا ایمیل (ایمیل بدون حساسیت به حروف، هم‌راستا با ایندکس یکتای lower(email))
export async function findUserByIdentifier(p: { kind: "mobile" | "email"; value: string }) {
  const [u] = await db
    .select()
    .from(users)
    .where(p.kind === "mobile" ? eq(users.mobile, p.value) : sql`lower(${users.email}) = ${p.value}`);
  return u ?? null;
}

export async function hasCustomerRole(userId: string): Promise<boolean> {
  const rows = await db
    .select({ key: roles.key, isStaff: roles.isStaff })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  return !rows.some((r) => r.isStaff) && rows.some((r) => r.key === "customer");
}

// ورود مشتری: نشست تازه (مدت از تنظیم auth.customer_session_days)، زمان آخرین ورود و ثبت رفتار «login»
export async function signInCustomer(userId: string, method: "password" | "sms" | "signup"): Promise<void> {
  // بین ۱ و ۳۶۵ روز (عدد خیلی بزرگ در تنظیمات، تاریخ انقضای نامعتبر می‌ساخت)
  const days = Math.min(365, Math.max(1, Number(await getSetting<number>("auth.customer_session_days")) || 30));
  await destroySession();
  await createSession(userId, { hours: days * 24 });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  if (method === "signup") await trackEvent({ userId, type: "signup" });
  await trackEvent({ userId, type: "login", props: { method } });
}
