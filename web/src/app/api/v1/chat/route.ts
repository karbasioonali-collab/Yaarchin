import { comingSoon, featureOff, loginRequired } from "@/lib/api";
import { getAuth } from "@/lib/auth/current";
import { isEnabled } from "@/lib/settings";

// پیام چت درباره‌ی محصول: فقط برای کاربر واردشده. گفتگو، ذخیره‌ی پیام و پاسخ AI در مرحله‌ی ۵ وصل می‌شود.
export async function POST() {
  if (!(await isEnabled("chat"))) return featureOff();
  if (!(await getAuth())) return loginRequired();
  return comingSoon();
}
