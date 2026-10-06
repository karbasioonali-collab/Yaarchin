// وارد کردن یک عکس محصول از لینک. docs/infoyaarchin.md بخش ۲۷.
// بدنه (JSON): { productId, url, listingId? } — هر درخواست یک لینک (پنل چند لینک را یکی‌یکی می‌فرستد).
// پاسخ: { ok, status: "added" | "duplicate", id, key, url } یا { ok: false, error }.
// اکستنشن (مرحله‌ی ۸) از همین مسیر و همین تابع (importProductImage با source = "extension") استفاده می‌کند؛
// فقط authorize پایین برایش یک راه دوم می‌گیرد (توکن اکستنشن به‌جای کوکی پنل). جای آن مشخص است.
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { can } from "@/lib/auth/can";
import { getAuth } from "@/lib/auth/current";
import { mediaReady } from "@/lib/db-ready";
import { importProductImage } from "@/lib/media/import";
import { isTrustedPanelRequest } from "@/lib/media/request-guard";
import { mediaUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const err = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

type Caller = { userId: string; actingAs: string | null; source: "url" | "extension" };

async function authorize(req: NextRequest): Promise<Caller | NextResponse> {
  // مرحله‌ی اکستنشن: اگر هدر توکن اکستنشن بود، همین‌جا بررسی و { source: "extension" } برگردانده شود.
  if (!isTrustedPanelRequest(req)) return err("درخواست نامعتبر است.", 403);
  const a = await getAuth();
  if (!a || !a.user.isStaff) return err("اول وارد پنل شوید.", 401);
  if (!(await can(a.user, "products.manage"))) return err("دسترسی ندارید.", 403);
  return { userId: a.user.id, actingAs: a.session.impersonatingUserId, source: "url" };
}

export async function POST(req: NextRequest) {
  const c = await authorize(req);
  if (c instanceof NextResponse) return c;
  if (!(await mediaReady())) return err("این امکان بعد از اجرای migration ۰۰۰۸ فعال می‌شود.", 409);
  let body: { productId?: unknown; url?: unknown; listingId?: unknown };
  try {
    body = await req.json();
  } catch {
    return err("بدنه‌ی درخواست JSON نیست.", 415);
  }
  const productId = typeof body.productId === "string" && UUID.test(body.productId) ? body.productId : null;
  const listingId = typeof body.listingId === "string" && body.listingId ? (UUID.test(body.listingId) ? body.listingId : "bad") : null;
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!productId) return err("محصول نامعتبر است.", 400);
  if (listingId === "bad") return err("لیستینگ نامعتبر است.", 400);
  if (!url) return err("لینک خالی است.", 400);

  const r = await importProductImage({ productId, url, listingId, source: c.source, byUserId: c.userId });
  if (r.status === "error") return err(r.error, r.httpStatus);
  if (r.status === "duplicate") return NextResponse.json({ ok: true, status: "duplicate", id: r.mediaId, key: r.key, url: mediaUrl(r.key, "sm") });
  await logActivity({
    actorUserId: c.userId,
    actingAsUserId: c.actingAs,
    action: "product.media.import",
    entityType: "product",
    entityId: productId,
    after: { id: r.mediaId, mediaFileId: r.fileId, key: r.key, sourceUrl: url, finalUrl: r.finalUrl, isPublic: false, source: c.source },
  });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, status: "added", id: r.mediaId, key: r.key, url: mediaUrl(r.key, "sm") });
}
