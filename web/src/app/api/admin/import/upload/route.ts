// آپلود صفحه‌ی ذخیره‌شده‌ی علی‌بابا (MHTML، یا HTML). docs/infoyaarchin.md بخش ۳۶.
// مثل آپلود عکس و ویدیو (src/app/api/admin/media/upload/route.ts): زیر /api تا proxy پنل بدنه‌ی بیش از ۱۰ مگابایت را نبُرد؛
// بدنه = خود فایل؛ ضد CSRF با هدر x-yc-upload و یکی بودن Origin؛ ورود و دسترسی (catalog.import) همین‌جا.
import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { can } from "@/lib/auth/can";
import { getAuth } from "@/lib/auth/current";
import { importReady } from "@/lib/db-ready";
import { readCapped } from "@/lib/http/read-capped";
import { importFile, MAX_FILE_BYTES } from "@/lib/import/service";
import { isTrustedPanelRequest } from "@/lib/media/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const err = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });

export async function POST(req: NextRequest) {
  if (!isTrustedPanelRequest(req)) return err("درخواست نامعتبر است.", 403);
  const a = await getAuth();
  if (!a || !a.user.isStaff) return err("اول وارد پنل شوید.", 401);
  if (!(await can(a.user, "catalog.import"))) return err("دسترسی ندارید.", 403);
  if (!(await importReady())) return err("ورود از علی‌بابا بعد از اجرای migration ۰۰۱۲ فعال می‌شود (در کنسول لیارا npm run db:migrate).", 409);
  const body = await readCapped(req, MAX_FILE_BYTES);
  if (body === "empty") return err("فایل خالی است.", 400);
  if (body === "too_big") return err(`فایل بزرگ‌تر از ${MAX_FILE_BYTES / 1024 / 1024} مگابایت است.`, 413);
  const fileName = (() => {
    try {
      return decodeURIComponent(req.headers.get("x-file-name") ?? "").slice(0, 200) || null;
    } catch {
      return null;
    }
  })();
  const r = await importFile(body, { fileName, by: a.user.id });
  if (!r.ok) return err(r.error, r.status, r.duplicateId ? { duplicateId: r.duplicateId } : {});
  await logActivity({
    actorUserId: a.user.id,
    actingAsUserId: a.session.impersonatingUserId,
    action: "import.upload",
    entityType: "raw_page",
    entityId: r.id,
    after: { fileName, bytes: body.length },
  });
  return NextResponse.json({ ok: true, id: r.id });
}
