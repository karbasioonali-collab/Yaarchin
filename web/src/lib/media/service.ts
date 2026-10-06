import "server-only";
// ذخیره‌ی عکس و ویدیو: بررسی نوع واقعی و حجم، پردازش، سقف فضای حالت آزمایشی، نوشتن در storage و ثبت در media_files.
// docs/infoyaarchin.md بخش ۲۶. هم آپلود پنل و هم (در PR بعد) وارد کردن از لینک و اکستنشن از همین‌جا رد می‌شوند.
import { createHash, randomBytes } from "node:crypto";
import { eq, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, mediaFiles, productMedia, siteBlocks } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { fmtNum } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { isUploadKey, storageMode, variantFile } from "@/lib/storage";
import { IMAGE_TYPES, rejectReason, sniff, VIDEO_TYPES } from "./detect";
import { ImageError, processImage } from "./process";
import { deleteFile, localFree, localUsage, putFile } from "./store";

export type MediaPurpose = "product" | "poster" | "category" | "slide";
export type MediaSource = "upload" | "url" | "extension";
export type MediaFile = typeof mediaFiles.$inferSelect;

const MB = 1024 * 1024;
// حاشیه‌ی امن دیسک در حالت آزمایشی (برای لاگ و فایل‌های موقت خود برنامه)
const DISK_MARGIN = 25 * MB;

export type MediaLimits = { imageMaxMb: number; batchMax: number; videoMaxMb: number; testTotalMb: number; testVideoMaxMb: number; mode: "s3" | "local" };

const clampNum = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
};

export async function mediaLimits(): Promise<MediaLimits> {
  const [imageMaxMb, batchMax, videoMaxMb, testTotalMb, testVideoMaxMb] = await Promise.all(
    ["media.image_max_mb", "media.batch_max", "media.video_max_mb", "media.test_total_mb", "media.test_video_max_mb"].map((k) => getSetting(k).catch(() => null)),
  );
  return {
    imageMaxMb: clampNum(imageMaxMb, 15, 1, 50),
    batchMax: Math.round(clampNum(batchMax, 20, 1, 100)),
    videoMaxMb: clampNum(videoMaxMb, 50, 1, 500),
    testTotalMb: clampNum(testTotalMb, 150, 10, 2000),
    testVideoMaxMb: clampNum(testVideoMaxMb, 20, 1, 200),
    mode: storageMode(),
  };
}

// بیشترین حجم ورودی مجاز (بایت) برای خواندن بدنه‌ی درخواست
export function maxInputBytes(l: MediaLimits, kind: "image" | "video" | "any"): number {
  const video = (l.mode === "local" ? Math.min(l.videoMaxMb, l.testVideoMaxMb) : l.videoMaxMb) * MB;
  if (kind === "image") return l.imageMaxMb * MB;
  if (kind === "video") return video;
  return Math.max(l.imageMaxMb * MB, video);
}

export const fmtMb = (bytes: number) => fmtNum(Math.round((bytes / MB) * 10) / 10);

// حالت آزمایشی: آیا این حجم جا می‌شود؟ (سقف کل از پنل + فضای واقعی دیسک)
async function checkLocalSpace(bytes: number, l: MediaLimits): Promise<string | null> {
  const used = await localUsage();
  if (used + bytes > l.testTotalMb * MB) {
    return `فضای حالت آزمایشی پر است (${fmtMb(used)} از ${fmtNum(l.testTotalMb)} مگابایت). چند فایل آزمایشی را حذف کنید یا فضای ابری لیارا را وصل کنید.`;
  }
  const free = await localFree();
  if (free !== null && free - bytes < DISK_MARGIN) {
    return `فضای دیسک برنامه روی سرور کم است (فقط ${fmtMb(free)} مگابایت آزاد). فایل ذخیره نشد؛ فضای ابری لیارا را وصل کنید.`;
  }
  return null;
}

export async function localSpaceInfo(): Promise<{ usedBytes: number; freeBytes: number | null }> {
  return { usedBytes: await localUsage(), freeBytes: await localFree() };
}

function newKey(kind: "img" | "vid", ext = ""): string {
  const d = new Date();
  // ۲۴ نویسه‌ی تصادفی (حدود ۱۲۴ بیت): آدرس فایل حدس‌زدنی نیست (فایل‌های «منتشر نشود» هم در باکت عمومی‌اند)
  const rand = Array.from(randomBytes(24), (x) => "abcdefghijklmnopqrstuvwxyz0123456789"[x % 36]).join("");
  return `${kind}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${rand}${ext}`;
}

export type StoreInput = {
  buf: Buffer;
  purpose: MediaPurpose;
  source: MediaSource;
  sourceUrl?: string | null;
  originalName?: string | null;
  byUserId: string | null;
  allowVideo: boolean;
};
export type StoreResult = { ok: true; file: MediaFile } | { ok: false; error: string; status: number };

export async function storeMedia(input: StoreInput): Promise<StoreResult> {
  const l = await mediaLimits();
  const t = sniff(input.buf);
  const isImage = IMAGE_TYPES.has(t);
  const isVideo = VIDEO_TYPES.has(t) && input.allowVideo;
  if (!isImage && !isVideo) return { ok: false, error: rejectReason(t, input.allowVideo ? "image_or_video" : "image"), status: 415 };
  const max = maxInputBytes(l, isImage ? "image" : "video");
  if (input.buf.length > max) {
    const what = isImage ? "عکس" : l.mode === "local" ? "ویدیو در حالت آزمایشی" : "ویدیو";
    return { ok: false, error: `حجم ${what} حداکثر ${fmtMb(max)} مگابایت است (این فایل ${fmtMb(input.buf.length)} مگابایت).`, status: 413 };
  }
  const sha256 = createHash("sha256").update(input.buf).digest("hex");

  let key: string;
  let files: { file: string; buf: Buffer; type: string }[];
  let width: number | null = null;
  let height: number | null = null;
  if (isImage) {
    try {
      const p = await processImage(input.buf);
      key = newKey("img");
      files = p.files.map((f) => ({ file: variantFile(key, f.size), buf: f.buf, type: "image/webp" }));
      ({ width, height } = p);
    } catch (e) {
      if (e instanceof ImageError) return { ok: false, error: e.message, status: 422 };
      throw e;
    }
  } else {
    // ویدیو بدون پردازش (ffmpeg برای پلن رایگان سنگین است)؛ فقط نوع واقعی و حجم بررسی شده
    const ext = t === "webm" ? ".webm" : ".mp4";
    key = newKey("vid", ext);
    files = [{ file: key, buf: input.buf, type: t === "webm" ? "video/webm" : "video/mp4" }];
  }
  const bytes = files.reduce((n, f) => n + f.buf.length, 0);
  if (l.mode === "local") {
    const err = await checkLocalSpace(bytes, l);
    if (err) return { ok: false, error: err, status: 507 };
  }
  const written: string[] = [];
  try {
    for (const f of files) {
      await putFile(f.file, f.buf, f.type);
      written.push(f.file);
    }
  } catch (e) {
    console.error("media store failed", e);
    for (const f of written) await deleteFile(f).catch(() => undefined);
    return {
      ok: false,
      error: l.mode === "local" ? "نوشتن فایل روی دیسک برنامه ناموفق بود." : "ارسال فایل به فضای ابری ناموفق بود؛ تنظیمات S3 در لیارا را بررسی کنید.",
      status: 502,
    };
  }
  const [file] = await db
    .insert(mediaFiles)
    .values({
      key,
      storage: l.mode,
      kind: isImage ? "image" : "video",
      mime: files[0].type,
      bytes,
      width,
      height,
      variants: isImage ? files.map((f) => Number(/-(\d+)\.webp$/.exec(f.file)?.[1])) : null,
      sha256,
      originalName: input.originalName?.slice(0, 200) ?? null,
      source: input.source,
      sourceUrl: input.sourceUrl ?? null,
      purpose: input.purpose,
      createdBy: input.byUserId,
    })
    .returning();
  // جای تشخیص لوگو با AI: requestLogoCheck(file) — فعلاً پیاده‌سازی نشده و همه «unchecked» می‌مانند
  return { ok: true, file };
}

// آیا این کلید هنوز جایی استفاده می‌شود؟ (عکس/ویدیو/پیش‌نمایش محصول، عکس دسته، هر بلوک سایت)
export async function isKeyReferenced(key: string): Promise<boolean> {
  const [pm] = await db
    .select({ id: productMedia.id })
    .from(productMedia)
    .where(or(eq(productMedia.storageKey, key), eq(productMedia.posterKey, key)))
    .limit(1);
  if (pm) return true;
  const [c] = await db.select({ id: categories.id }).from(categories).where(eq(categories.image, key)).limit(1);
  if (c) return true;
  const [b] = await db
    .select({ key: siteBlocks.key })
    .from(siteBlocks)
    .where(sql`position(${key} in ${siteBlocks.data}::text) > 0`)
    .limit(1);
  return !!b;
}

// بعد از حذف ردیفی که به فایل اشاره می‌کرد: اگر فایل آپلودی دیگر جایی استفاده نمی‌شود، از storage و media_files پاک شود.
// آدرس‌های دستی (https) و فایل‌های demo دست نمی‌خورند.
export async function releaseKey(key: string | null | undefined, actor: { userId: string; actingAs?: string | null }): Promise<boolean> {
  if (!key || !isUploadKey(key)) return false;
  if (await isKeyReferenced(key)) return false;
  const [f] = await db.select().from(mediaFiles).where(eq(mediaFiles.key, key));
  const names = key.startsWith("img/") ? (["sm", "md", "lg"] as const).map((s) => variantFile(key, s)) : [key];
  try {
    for (const n of names) await deleteFile(n);
  } catch (e) {
    console.error("media delete failed", e);
    return false;
  }
  if (f) await db.delete(mediaFiles).where(eq(mediaFiles.id, f.id));
  await logActivity({
    actorUserId: actor.userId,
    actingAsUserId: actor.actingAs ?? null,
    action: "media.delete",
    entityType: "media_file",
    entityId: f?.id,
    before: { key, kind: f?.kind, bytes: f?.bytes, storage: f?.storage, purpose: f?.purpose },
  });
  return true;
}
