// عکس محصولی که با «ورود از علی‌بابا» ثبت شده، مستقیم از دیتابیس (raw_page_images). docs/infoyaarchin.md بخش ۳۷.
// چرا: دیسک برنامه روی لیارا با هر استقرار پاک می‌شود و فضای ابری (S3) هنوز راه نیفتاده؛ این عکس‌ها با استقرار نمی‌پرند.
// product_media.storage_key = «/media-db/<id>» (mediaUrl کلیدهای «/…» را همان‌طور برمی‌گرداند).
// دسترسی: عمومی فقط اگر عکس به محصول منتشرشده وصل و «عمومی» باشد؛ وگرنه فقط کارکنان پنل.
// قالب: همان بایت‌های ذخیره‌شده (معمولاً AVIF). مرورگری که AVIF نمی‌پذیرد (Accept بدون image/avif؛ مثلاً Safari قدیمی) JPEG ساخته‌شده با sharp می‌گیرد.
import { and, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { db } from "@/db/client";
import { productMedia, products, rawPageImages } from "@/db/schema";
import { getAuth } from "@/lib/auth/current";
import { importReady } from "@/lib/db-ready";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => new NextResponse(null, { status: 404 });

export async function GET(req: NextRequest, ctx: RouteContext<"/media-db/[id]">) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0 || !(await importReady())) return notFound();
  const [img] = await db.select({ mime: rawPageImages.mime, bytes: rawPageImages.bytes }).from(rawPageImages).where(eq(rawPageImages.id, id));
  if (!img?.bytes || !/^image\/(avif|webp|jpeg|png|gif)$/.test(img.mime)) return notFound();
  const [pub] = await db
    .select({ one: sql<number>`1` })
    .from(productMedia)
    .innerJoin(products, eq(products.id, productMedia.productId))
    .where(and(eq(productMedia.storageKey, `/media-db/${id}`), eq(productMedia.isPublic, true), eq(products.status, "published")))
    .limit(1);
  if (!pub) {
    const a = await getAuth();
    if (!a?.user.isStaff) return notFound();
  }
  let body: Buffer = img.bytes;
  let type = img.mime;
  if (type === "image/avif" && !/image\/avif/.test(req.headers.get("accept") ?? "")) {
    body = await sharp(img.bytes).jpeg({ quality: 85 }).toBuffer();
    type = "image/jpeg";
  }
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": type,
      // بایت‌های هر id عوض نمی‌شوند ولی «عمومی» بودن عوض می‌شود: کش عمومی یک روز (نه یک سال)، تا عکسی که غیرعمومی شد زود از کش‌ها برود
      "cache-control": pub ? "public, max-age=86400" : "private, no-store",
      vary: "Accept",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
