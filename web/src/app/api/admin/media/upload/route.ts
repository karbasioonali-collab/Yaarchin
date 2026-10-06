// آپلود یک فایل از پنل (عکس یا ویدیو). docs/infoyaarchin.md بخش ۲۶.
// چرا زیر /api و نه /admin: proxy پنل (src/proxy.ts، matcher /admin/*) بدنه‌ی هر درخواست را در حافظه کپی می‌کند و
// بیش از ۱۰ مگابایت را می‌بُرد؛ اینجا proxy اجرا نمی‌شود و ورود و دسترسی همین‌جا بررسی می‌شود.
// بدنه = خود فایل (نه multipart)؛ هر درخواست یک فایل. پارامترها در query:
//   purpose=product&productId=…&hasLogo=1  ← عکس/ویدیوی محصول (products.manage)؛ ردیف product_media هم ساخته می‌شود
//   purpose=poster                          ← عکس پیش‌نمایش ویدیو (products.manage)
//   purpose=category                        ← عکس دسته (categories.manage)
//   purpose=slide                           ← عکس اسلایدر و محتوای سایت (site.manage)
// ضد CSRF: هدر سفارشی x-yc-upload (فرم یا سایت دیگر بدون preflight نمی‌تواند بفرستد) + یکی بودن Origin با میزبان.
import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { productMedia, products } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { can } from "@/lib/auth/can";
import { getAuth } from "@/lib/auth/current";
import { mediaReady } from "@/lib/db-ready";
import { fmtMb, maxInputBytes, mediaLimits, type MediaPurpose, storeMedia } from "@/lib/media/service";
import { mediaUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM: Record<MediaPurpose, string> = { product: "products.manage", poster: "products.manage", category: "categories.manage", slide: "site.manage" };
const UUID = /^[0-9a-f-]{36}$/i;
const err = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// خواندن بدنه با سقف حجم: اگر Content-Length بزرگ‌تر باشد فوراً رد می‌شود، وگرنه هنگام خواندن شمرده می‌شود
async function readCapped(req: NextRequest, max: number): Promise<Buffer | "too_big" | "empty"> {
  const len = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(len) && len > max) return "too_big";
  if (!req.body) return "empty";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      await reader.cancel().catch(() => undefined);
      return "too_big";
    }
    chunks.push(value);
  }
  return n ? Buffer.concat(chunks) : "empty";
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-yc-upload") !== "1" || !sameOrigin(req)) return err("درخواست نامعتبر است.", 403);
  const a = await getAuth();
  if (!a || !a.user.isStaff) return err("اول وارد پنل شوید.", 401);
  const sp = req.nextUrl.searchParams;
  const purpose = sp.get("purpose") as MediaPurpose;
  if (!(purpose in PERM)) return err("مقصد آپلود نامعتبر است.", 400);
  if (!(await can(a.user, PERM[purpose]))) return err("دسترسی ندارید.", 403);
  if (!(await mediaReady())) return err("آپلود بعد از اجرای migration ۰۰۰۸ فعال می‌شود (در کنسول لیارا npm run db:migrate). فعلاً آدرس عکس را دستی وارد کنید.", 409);

  const productId = sp.get("productId") ?? "";
  if (purpose === "product") {
    if (!UUID.test(productId)) return err("محصول نامعتبر است.", 400);
    const [p] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
    if (!p) return err("محصول پیدا نشد.", 404);
  }

  const l = await mediaLimits();
  const allowVideo = purpose === "product";
  const max = maxInputBytes(l, allowVideo ? "any" : "image");
  const body = await readCapped(req, max);
  if (body === "empty") return err("فایل خالی است.", 400);
  if (body === "too_big") return err(`فایل بزرگ‌تر از حد مجاز است (حداکثر ${fmtMb(max)} مگابایت).`, 413);

  const name = (() => {
    try {
      return decodeURIComponent(req.headers.get("x-file-name") ?? "").slice(0, 200) || null;
    } catch {
      return null;
    }
  })();
  const r = await storeMedia({ buf: body, purpose, source: "upload", originalName: name, byUserId: a.user.id, allowVideo });
  if (!r.ok) return err(r.error, r.status);
  const f = r.file;
  const actor = { actorUserId: a.user.id, actingAsUserId: a.session.impersonatingUserId };
  const fileInfo = { mediaFileId: f.id, key: f.key, kind: f.kind, bytes: f.bytes, width: f.width, height: f.height, storage: f.storage, name };

  if (purpose === "product") {
    const hasLogo = sp.get("hasLogo") === "1";
    const [{ n }] = await db.select({ n: count() }).from(productMedia).where(eq(productMedia.productId, productId));
    const [row] = await db
      .insert(productMedia)
      .values({ productId, kind: f.kind, storageKey: f.key, width: f.width, height: f.height, isPublic: !hasLogo, sortOrder: n })
      .returning({ id: productMedia.id });
    await logActivity({ ...actor, action: "product.media.upload", entityType: "product", entityId: productId, after: { id: row.id, isPublic: !hasLogo, ...fileInfo } });
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, id: row.id, key: f.key, kind: f.kind, url: mediaUrl(f.key, "sm") });
  }
  await logActivity({ ...actor, action: "media.upload", entityType: "media_file", entityId: f.id, after: { purpose, ...fileInfo } });
  return NextResponse.json({ ok: true, key: f.key, kind: f.kind, url: mediaUrl(f.key, purpose === "slide" ? "lg" : "sm") });
}
