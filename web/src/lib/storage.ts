// لایه‌ی storage: دیتابیس فقط «کلید» فایل را نگه می‌دارد (مثل demo/products/x.svg)، نه آدرس کامل.
// آدرس نمایش از اینجا ساخته می‌شود تا عوض کردن محل فایل‌ها (دیسک، S3 لیارا، CDN) فقط همین فایل را عوض کند.
//   STORAGE_PUBLIC_BASE_URL خالی ← فایل‌ها از public/media همین برنامه (فعلاً فقط فایل‌های demo)
//   STORAGE_PUBLIC_BASE_URL=https://… ← آدرس باکت/CDN (برای آپلودهای واقعی؛ مرحله‌ی ۳)
const BASE = (process.env.STORAGE_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");

export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  // آدرس کامل یا مسیر مطلق (مثلاً عکس اسلاید که ادمین وارد کرده) همان‌طور برمی‌گردد
  if (/^https:\/\//.test(key) || key.startsWith("/")) return key;
  const clean = key.replace(/^\/+/, "");
  // فایل‌های demo همیشه داخل برنامه هستند
  if (!BASE || clean.startsWith("demo/")) return `/media/${clean}`;
  return `${BASE}/${clean}`;
}
