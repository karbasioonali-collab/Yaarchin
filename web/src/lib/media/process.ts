import "server-only";
// پردازش عکس با sharp (همان کتابخانه‌ای که Next خودش برای عکس‌ها نصب می‌کند؛ بدون حجم یا زمان build اضافه).
// - چرخش درست طبق EXIF، بعد ساخت سه اندازه‌ی WebP؛ sharp به‌طور پیش‌فرض هیچ متادیتایی (EXIF، GPS، ICC، XMP) را
//   در خروجی نمی‌نویسد، پس اطلاعات داخل عکس پاک می‌شود. فایل اصلی نگه داشته نمی‌شود.
// - محدودیت حافظه (پلن رایگان): هر بار فقط یک عکس پردازش می‌شود (صف) و عکس بیش از ۴۰ مگاپیکسل رد می‌شود.
import sharp, { type Metadata } from "sharp";
import { IMAGE_WIDTHS, type MediaSize } from "@/lib/storage";

sharp.cache(false);
sharp.concurrency(1);

const MAX_PIXELS = 40_000_000;
const QUALITY: Record<MediaSize, number> = { sm: 74, md: 80, lg: 82 };

export type ProcessedImage = { width: number; height: number; files: { size: MediaSize; buf: Buffer }[] };

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export class ImageError extends Error {}

export function processImage(input: Buffer): Promise<ProcessedImage> {
  return serial(async () => {
    let meta: Metadata;
    try {
      meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
    } catch {
      throw new ImageError("فایل عکس خراب است یا خوانده نمی‌شود.");
    }
    if (!meta.width || !meta.height) throw new ImageError("ابعاد عکس خوانده نمی‌شود.");
    if (meta.width * meta.height > MAX_PIXELS) throw new ImageError("عکس خیلی بزرگ است (بیش از ۴۰ مگاپیکسل).");
    // فقط فریم اول GIF متحرک؛ autoOrient = چرخش طبق EXIF
    const base = sharp(input, { limitInputPixels: MAX_PIXELS, animated: false, failOn: "error" }).autoOrient();
    const files: ProcessedImage["files"] = [];
    let width = 0;
    let height = 0;
    try {
      for (const size of Object.keys(IMAGE_WIDTHS) as MediaSize[]) {
        const { data, info } = await base
          .clone()
          .resize({ width: IMAGE_WIDTHS[size], withoutEnlargement: true })
          .webp({ quality: QUALITY[size], effort: 4 })
          .toBuffer({ resolveWithObject: true });
        files.push({ size, buf: data });
        if (size === "lg") ({ width, height } = info);
      }
    } catch {
      throw new ImageError("پردازش عکس ناموفق بود؛ فایل خراب است یا نوعش پشتیبانی نمی‌شود.");
    }
    return { width, height, files };
  });
}
