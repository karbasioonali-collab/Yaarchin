"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { destroySession, revokeAllSessions } from "@/lib/auth/session";
import { getCustomer } from "@/lib/customer/auth";
import { customerPasswordError } from "@/lib/customer/password";
import { saveProfile, toBusinessType } from "@/lib/customer/profile";
import { topCategoryOptions } from "@/lib/catalog/public";
import { customerReady } from "@/lib/db-ready";
import { normalizeEmail, normalizeMobile } from "@/lib/validation";

// کارهای مشتری روی حساب خودش. هر action خودش ورود را بررسی می‌کند (مشتری فعال).
// تغییر موبایل، ایمیل و رمز برای پیگیری امنیتی در لاگ فعالیت هم ثبت می‌شود (بدون رمز یا هش).
export type AccountState = { error?: string; ok?: string } | null;

const LOGIN_AGAIN = "نشست شما تمام شده؛ دوباره وارد شوید.";

export async function updateAccountAction(_prev: AccountState, fd: FormData): Promise<AccountState> {
  const a = await getCustomer();
  if (!a) return { error: LOGIN_AGAIN };
  const fullName = String(fd.get("fullName") ?? "").trim().replace(/\s+/g, " ");
  const mobileRaw = String(fd.get("mobile") ?? "").trim();
  const emailRaw = String(fd.get("email") ?? "").trim();
  if (fullName.length < 2 || fullName.length > 80) return { error: "نام و نام خانوادگی را وارد کنید (۲ تا ۸۰ حرف)." };
  const mobile = mobileRaw ? normalizeMobile(mobileRaw) : null;
  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  if (mobileRaw && !mobile) return { error: "شماره موبایل معتبر نیست (مثل ۰۹۱۲۱۲۳۴۵۶۷)." };
  if (emailRaw && !email) return { error: "ایمیل معتبر نیست." };
  if (!mobile && !email) return { error: "حداقل یکی از موبایل یا ایمیل لازم است (برای ورود)." };

  const [me] = await db.select().from(users).where(eq(users.id, a.user.id));
  const oldEmail = me.email?.toLowerCase() ?? null;
  const mobileChanged = mobile !== me.mobile;
  const emailChanged = email !== oldEmail;
  const contactChanged = mobileChanged || emailChanged;
  if (contactChanged) {
    // تغییر شناسه‌ی ورود فقط با رمز فعلی (اگر کسی گوشیِ بازِ مشتری را برداشت، نتواند حساب را بدزدد)
    if (!(await verifyPassword(me.passwordHash, String(fd.get("currentPassword") ?? "")))) {
      return { error: "برای تغییر موبایل یا ایمیل، رمز فعلی را درست وارد کنید." };
    }
    if (mobile && mobileChanged) {
      const [dup] = await db.select({ id: users.id }).from(users).where(and(eq(users.mobile, mobile), ne(users.id, me.id)));
      if (dup) return { error: "این موبایل برای حساب دیگری ثبت شده است." };
    }
    if (email && emailChanged) {
      const [dup] = await db.select({ id: users.id }).from(users).where(and(sql`lower(${users.email}) = ${email}`, ne(users.id, me.id)));
      if (dup) return { error: "این ایمیل برای حساب دیگری ثبت شده است." };
    }
  }
  try {
    await db
      .update(users)
      .set({
        fullName,
        mobile,
        email,
        // موبایل یا ایمیل تازه هنوز تأیید نشده است
        ...(mobileChanged && { mobileVerifiedAt: null }),
        ...(emailChanged && { emailVerifiedAt: null }),
      })
      .where(eq(users.id, me.id));
  } catch (e) {
    if ((e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505") {
      return { error: "این موبایل یا ایمیل برای حساب دیگری ثبت شده است." };
    }
    throw e;
  }
  if (contactChanged) {
    await logActivity({
      actorUserId: me.id,
      action: "customer.contact_change",
      entityType: "user",
      entityId: me.id,
      before: { mobile: me.mobile, email: me.email },
      after: { mobile, email },
    });
  }
  revalidatePath("/", "layout");
  return { ok: "ذخیره شد." };
}

export async function changePasswordAction(_prev: AccountState, fd: FormData): Promise<AccountState> {
  const a = await getCustomer();
  if (!a) return { error: LOGIN_AGAIN };
  const current = String(fd.get("currentPassword") ?? "");
  const next = String(fd.get("newPassword") ?? "");
  const [me] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, a.user.id));
  if (!(await verifyPassword(me.hash, current))) return { error: "رمز فعلی درست نیست." };
  const policy = customerPasswordError(next);
  if (policy) return { error: policy };
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, a.user.id));
  // دستگاه‌های دیگر خارج می‌شوند؛ همین دستگاه وارد می‌ماند
  await revokeAllSessions(a.user.id, a.session.id);
  await logActivity({ actorUserId: a.user.id, action: "customer.password_change", entityType: "user", entityId: a.user.id });
  return { ok: "رمز تغییر کرد. دستگاه‌های دیگر از حساب خارج شدند." };
}

export async function saveBusinessProfileAction(_prev: AccountState, fd: FormData): Promise<AccountState> {
  const a = await getCustomer();
  if (!a) return { error: LOGIN_AGAIN };
  if (!(await customerReady())) return { error: "این بخش به‌زودی فعال می‌شود." };
  const businessType = toBusinessType(fd.get("businessType"));
  const city = String(fd.get("city") ?? "").trim().replace(/\s+/g, " ").slice(0, 60) || null;
  const imp = String(fd.get("importExperience") ?? "");
  const hasImportExperience = imp === "yes" ? true : imp === "no" ? false : null;
  // فقط دسته‌های اصلی قابل‌نمایش پذیرفته می‌شوند (شناسه‌ی دستکاری‌شده نادیده گرفته می‌شود)
  const allowed = new Set((await topCategoryOptions()).map((c) => c.id));
  const interestIds = [...new Set(fd.getAll("interests").map(String))].filter((id) => allowed.has(id));
  await saveProfile(a.user.id, { businessType, city, hasImportExperience, interestIds });
  return { ok: "پروفایل کسب‌وکار ذخیره شد." };
}

// «خروج از همه‌ی دستگاه‌ها»: همه‌ی نشست‌ها، از جمله همین دستگاه
export async function logoutEverywhereAction(): Promise<void> {
  const a = await getCustomer();
  if (a) {
    await revokeAllSessions(a.user.id);
    await logActivity({ actorUserId: a.user.id, action: "customer.logout_all", entityType: "user", entityId: a.user.id });
  }
  await destroySession();
  redirect("/login");
}

export async function customerLogoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
