// عکس اصلی صفحه‌ی واردشده از دیتابیس (raw_page_images) برای صفحه‌ی بررسی. فقط کارکنان با catalog.import.
// docs/infoyaarchin.md بخش ۳۶. بعد از انتقال به فضای ابری (storage_key) به آدرس storage هدایت می‌شود.
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { rawPageImages } from "@/db/schema";
import { can } from "@/lib/auth/can";
import { getAuth } from "@/lib/auth/current";
import { importReady } from "@/lib/db-ready";
import { mediaUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/admin/import/image/[id]">) {
  const a = await getAuth();
  if (!a || !a.user.isStaff || !(await can(a.user, "catalog.import")) || !(await importReady())) return new NextResponse(null, { status: 404 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse(null, { status: 404 });
  const [img] = await db.select({ mime: rawPageImages.mime, bytes: rawPageImages.bytes, key: rawPageImages.storageKey }).from(rawPageImages).where(eq(rawPageImages.id, id));
  if (!img) return new NextResponse(null, { status: 404 });
  if (!img.bytes) {
    const url = img.key ? mediaUrl(img.key, "md") : null;
    return url ? NextResponse.redirect(new URL(url, req.url)) : new NextResponse(null, { status: 404 });
  }
  if (!/^image\/(avif|webp|jpeg|png|gif)$/.test(img.mime)) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(img.bytes), {
    headers: {
      "content-type": img.mime,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
