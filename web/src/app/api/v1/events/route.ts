import { apiError } from "@/lib/api";
import { getAuth } from "@/lib/auth/current";
import { publishedProductId, visibleCategoryId } from "@/lib/catalog/public";
import { isCustomer } from "@/lib/customer/auth";
import { trackDailyVisit, trackView } from "@/lib/customer/events";

// ثبت بازدید مشتری واردشده (از components/site/Tracker.tsx، بعد از باز شدن هر صفحه در مرورگر).
// بازدید از مرورگر ثبت می‌شود، نه هنگام ساخت صفحه در سرور، تا prefetch لینک‌ها بازدید حساب نشود.
// بدنه: {"path": "/p/<slug>", "referrer": "..."}. برای بازدیدکننده‌ی واردنشده و کارمند چیزی ثبت نمی‌شود.
const ok = () => new Response(null, { status: 204 });

export async function POST(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json")) return apiError(415, "json_required", "درخواست نامعتبر است.");
  const a = await getAuth();
  if (!a || !isCustomer(a.user)) return ok();
  const body = (await req.json().catch(() => null)) as { path?: unknown; referrer?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path.slice(0, 300) : "";
  if (!path.startsWith("/")) return ok();
  const referrer = typeof body?.referrer === "string" ? body.referrer.slice(0, 500) : null;

  await trackDailyVisit(a.user.id, path);
  const m = /^\/(p|c)\/([a-z0-9-]{1,120})$/.exec(path);
  if (m) {
    const entityId = m[1] === "p" ? await publishedProductId(m[2]) : await visibleCategoryId(m[2]);
    if (entityId) {
      await trackView({ userId: a.user.id, type: m[1] === "p" ? "product_view" : "category_view", entityId, path, referrer });
    }
  }
  return ok();
}
