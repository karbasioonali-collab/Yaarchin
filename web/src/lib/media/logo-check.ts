import "server-only";
// جای «تشخیص لوگو با AI» (فقط ساختار؛ پیاده‌سازی نشده). docs/infoyaarchin.md بخش ۲۷.
// هر فایل تازه (آپلود، لینک، اکستنشن) بعد از ذخیره اینجا می‌آید. وقتی مدل AI وصل شد:
//   1. اینجا logo_check = 'pending' شود و کار در صف/پس‌زمینه (مثل زمان‌بند گفتگو، src/lib/chat/scheduler.ts) انجام شود؛
//   2. نتیجه در media_files.logo_check ('clean' | 'has_logo' | 'error')، logo_check_at و logo_check_note ثبت شود؛
//   3. برای has_logo، ردیف‌های product_media همان کلید is_public = false شوند (هرگز خودکار true نشوند؛ انتشار با انسان است).
// طبق قاعده‌ی سرویس‌های پولی پروژه، باید «حالت آزمایشی» هم داشته باشد (بدون کلید AI نتیجه‌ی ساختگی و قابل دیدن در پنل).
import type { MediaFile } from "./service";

export async function requestLogoCheck(file: MediaFile): Promise<void> {
  // فعلاً هیچ کاری نمی‌کند؛ همه‌ی فایل‌ها logo_check = 'unchecked' می‌مانند.
  void file;
}
