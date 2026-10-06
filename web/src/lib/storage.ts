// لایه‌ی storage: دیتابیس فقط «کلید» فایل را نگه می‌دارد (مثل demo/products/x.svg یا img/2026/10/<تصادفی>)، نه آدرس کامل.
// آدرس نمایش فقط از اینجا ساخته می‌شود تا عوض کردن محل فایل‌ها (دیسک، فضای ابری لیارا، CDN) فقط همین فایل را عوض کند.
// docs/infoyaarchin.md بخش ۲۶.
//
// محل فایل‌های آپلودی (از متغیرهای محیطی لیارا):
//   S3_ENDPOINT + S3_BUCKET + S3_ACCESS_KEY + S3_SECRET_KEY همه پر ← فضای ابری (حالت واقعی)
//     STORAGE_PUBLIC_BASE_URL (اختیاری) ← آدرس عمومی فایل‌های باکت؛ خالی = <S3_ENDPOINT>/<S3_BUCKET>
//   هر کدام خالی ← «حالت آزمایشی»: دیسک خود برنامه (MEDIA_LOCAL_DIR، پیش‌فرض ‎.data/media)، از مسیر /files/… سرو می‌شود
//     و با هر استقرار پاک می‌شود.
// فایل‌های demo همیشه از public/media همین برنامه‌اند. آدرس کامل https و مسیر مطلق «/…» همان‌طور برمی‌گردند (آدرس دستی).

export type S3Config = { endpoint: string; bucket: string; accessKey: string; secretKey: string; region: string; publicBase: string };

export function s3Config(): S3Config | null {
  const endpoint = (process.env.S3_ENDPOINT ?? "").trim().replace(/\/+$/, "");
  const bucket = (process.env.S3_BUCKET ?? "").trim();
  const accessKey = (process.env.S3_ACCESS_KEY ?? "").trim();
  const secretKey = (process.env.S3_SECRET_KEY ?? "").trim();
  if (!/^https:\/\//.test(endpoint) || !bucket || !accessKey || !secretKey) return null;
  const publicBase = (process.env.STORAGE_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "") || `${endpoint}/${bucket}`;
  return { endpoint, bucket, accessKey, secretKey, region: (process.env.S3_REGION ?? "").trim() || "us-east-1", publicBase };
}

export const storageMode = (): "s3" | "local" => (s3Config() ? "s3" : "local");

// سه اندازه‌ی هر عکس آپلودی: sm کارت محصول و عکس‌های کوچک، md صفحه‌ی محصول، lg بزرگ‌نمایی و اسلایدر
export const IMAGE_WIDTHS = { sm: 480, md: 1000, lg: 1800 } as const;
export type MediaSize = keyof typeof IMAGE_WIDTHS;

// کلید فایل آپلودی: img/<سال>/<ماه>/<۲۴ نویسه‌ی تصادفی> (عکس، بدون پسوند) یا vid/…/<تصادفی>.mp4|webm
export const UPLOAD_KEY_RE = /^(img\/\d{4}\/\d{2}\/[a-z0-9]{24}|vid\/\d{4}\/\d{2}\/[a-z0-9]{24}\.(mp4|webm))$/;
export const isUploadKey = (k: string | null | undefined): boolean => !!k && UPLOAD_KEY_RE.test(k);

// اسم فایل واقعی یک اندازه در storage
export const variantFile = (key: string, size: MediaSize) => (key.startsWith("img/") ? `${key}-${IMAGE_WIDTHS[size]}.webp` : key);

export function mediaUrl(key: string | null | undefined, size: MediaSize = "md"): string | null {
  if (!key) return null;
  // آدرس کامل یا مسیر مطلق (مثلاً عکسی که ادمین با آدرس وارد کرده) همان‌طور برمی‌گردد
  if (/^https:\/\//.test(key) || key.startsWith("/")) return key;
  const clean = key.replace(/^\/+/, "");
  if (isUploadKey(clean)) {
    const s3 = s3Config();
    return `${s3 ? s3.publicBase : "/files"}/${variantFile(clean, size)}`;
  }
  // فایل‌های demo (و هر کلید قدیمی دیگر) داخل برنامه‌اند
  const base = (process.env.STORAGE_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base || clean.startsWith("demo/")) return `/media/${clean}`;
  return `${base}/${clean}`;
}
