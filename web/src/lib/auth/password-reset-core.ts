// تغییر رمز کاربر از پنل (بخش ۵۶): قاعده‌های خالص (بدون server-only؛ تست واحد مستقیم اجرایش می‌کند).
//   مشتری ← قانون ثبت‌نام مشتری (حداقل ۸ نویسه)؛ کارشناس و ادمین ← قانون رمز پنل (۱۲ نویسه، حرف بزرگ و کوچک، عدد، نماد)
//   چه کسی: رمز کارمند (هر نقش پنلی) فقط مدیر اصلی؛ رمز مشتری ← مدیر یا دارنده‌ی customers.reset_password
import { customerPasswordError } from "../customer/password";
import { passwordError } from "./password-policy.mjs";

export type ResetTarget = "customer" | "staff";
export const RESET_PERMISSION = "customers.reset_password";

export const RESET_MSG = {
  mismatch: "رمز و تکرار آن یکی نیستند.",
  staffOnlyAdmin: "رمز کارشناس‌ها و ادمین‌ها را فقط مدیر اصلی می‌تواند عوض کند.",
  noPermission: "برای تغییر رمز مشتری، دسترسی «تغییر رمز مشتری‌ها» لازم است.",
  notCustomer: "این حساب کارمند است؛ رمزش فقط از بخش «کاربران» و فقط با مدیر اصلی عوض می‌شود.",
  notFound: "کاربر پیدا نشد.",
} as const;

// خطای رمز تازه، یا null (اول قانون رمز همان نوع کاربر، بعد یکی بودن با تکرار)
export function resetPasswordError(target: ResetTarget, password: string, confirm: string): string | null {
  const policy = target === "customer" ? customerPasswordError(password) : passwordError(password);
  if (policy) return policy;
  if (password !== confirm) return RESET_MSG.mismatch;
  return null;
}

// اجازه‌ی تغییر رمز: actorIsAdmin = نقش ادمین؛ hasPermission = can(user, customers.reset_password)
export function resetAllowed(target: ResetTarget, actorIsAdmin: boolean, hasPermission: boolean): string | null {
  if (actorIsAdmin) return null;
  if (target === "staff") return RESET_MSG.staffOnlyAdmin;
  return hasPermission ? null : RESET_MSG.noPermission;
}
