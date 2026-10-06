import "server-only";
// وارد کردن عکس محصول از لینک (مثلاً عکس علی‌بابا): دانلود امن ← همان بررسی و پردازش آپلود (storeMedia) ← ردیف product_media.
// docs/infoyaarchin.md بخش ۲۷.
// - عکس واردشده همیشه «منتشر نشود» ثبت می‌شود تا انسان بررسی و منتشرش کند (ممکن است لوگوی کارخانه داشته باشد).
// - عکس تکراری (همان فایل، با sha256) برای همان محصول دوباره ذخیره نمی‌شود؛ اکستنشن می‌تواند بی‌خطر چند بار بفرستد.
// - اکستنشن (مرحله‌ی بعد) همین تابع را با source = "extension" صدا می‌زند؛ فقط احراز هویتش در مسیر API فرق می‌کند.
import { createHash } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mediaFiles, productListings, productMedia, products } from "@/db/schema";
import { downloadFile, RemoteError } from "./fetch-remote";
import { fmtMb, mediaLimits, storeMedia } from "./service";

export type ImportInput = { productId: string; url: string; listingId?: string | null; source: "url" | "extension"; byUserId: string | null };
export type ImportResult =
  | { status: "added"; mediaId: string; key: string; fileId: string; finalUrl: string }
  | { status: "duplicate"; mediaId: string; key: string }
  | { status: "error"; error: string; httpStatus: number };

export async function importProductImage(input: ImportInput): Promise<ImportResult> {
  const [p] = await db.select({ id: products.id }).from(products).where(eq(products.id, input.productId));
  if (!p) return { status: "error", error: "محصول پیدا نشد.", httpStatus: 404 };
  if (input.listingId) {
    const [l] = await db
      .select({ id: productListings.id })
      .from(productListings)
      .where(and(eq(productListings.id, input.listingId), eq(productListings.productId, input.productId)));
    if (!l) return { status: "error", error: "لیستینگ انتخاب‌شده مال این محصول نیست.", httpStatus: 400 };
  }
  const l = await mediaLimits();
  const max = l.imageMaxMb * 1024 * 1024;
  let dl: { buf: Buffer; finalUrl: string };
  try {
    dl = await downloadFile(input.url, max);
  } catch (e) {
    if (e instanceof RemoteError) return { status: "error", error: e.message.includes("حد مجاز") ? `عکس بزرگ‌تر از ${fmtMb(max)} مگابایت است.` : e.message, httpStatus: 422 };
    console.error("media import download failed", e);
    return { status: "error", error: "دانلود ناموفق بود.", httpStatus: 502 };
  }
  const sha256 = createHash("sha256").update(dl.buf).digest("hex");
  const [dup] = await db
    .select({ id: productMedia.id, key: productMedia.storageKey })
    .from(productMedia)
    .innerJoin(mediaFiles, eq(mediaFiles.key, productMedia.storageKey))
    .where(and(eq(productMedia.productId, input.productId), eq(mediaFiles.sha256, sha256)))
    .limit(1);
  if (dup) return { status: "duplicate", mediaId: dup.id, key: dup.key };

  const r = await storeMedia({ buf: dl.buf, purpose: "product", source: input.source, sourceUrl: input.url.slice(0, 2000), byUserId: input.byUserId, allowVideo: false });
  if (!r.ok) return { status: "error", error: r.error, httpStatus: r.status };
  const f = r.file;
  const [{ n }] = await db.select({ n: count() }).from(productMedia).where(eq(productMedia.productId, input.productId));
  const [row] = await db
    .insert(productMedia)
    .values({
      productId: input.productId,
      listingId: input.listingId ?? null,
      kind: "image",
      storageKey: f.key,
      width: f.width,
      height: f.height,
      isPublic: false,
      sortOrder: n,
      source: input.source === "extension" ? "extension" : "manual",
    })
    .returning({ id: productMedia.id });
  return { status: "added", mediaId: row.id, key: f.key, fileId: f.id, finalUrl: dl.finalUrl };
}
