import { comingSoon, featureOff, loginRequired } from "@/lib/api";
import { getAuth } from "@/lib/auth/current";
import { isEnabled } from "@/lib/settings";

// افزودن به علاقه‌مندی‌ها: فقط برای کاربر واردشده. جدول favorites و ثبت‌نام مشتری در مرحله‌ی ۵ ساخته می‌شوند.
export async function POST() {
  if (!(await isEnabled("favorites"))) return featureOff();
  if (!(await getAuth())) return loginRequired();
  return comingSoon();
}
