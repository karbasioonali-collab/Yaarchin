import { apiError } from "@/lib/api";
import { getAuth } from "@/lib/auth/current";
import { publishedProductId, visibleCategoryId } from "@/lib/catalog/public";
import { isCustomer } from "@/lib/customer/auth";
import { trackDailyVisit, trackView } from "@/lib/customer/events";
import { isBot, isPrefetch } from "@/lib/site/guest-core";
import { trackGuest } from "@/lib/site/guest";

// ثبت بازدید (از components/site/Tracker.tsx، بعد از باز شدن هر صفحه در مرورگر).
// بازدید از مرورگر ثبت می‌شود، نه هنگام ساخت صفحه در سرور، تا prefetch لینک‌ها بازدید حساب نشود.
// بدنه: {"path": "/p/<slug>", "referrer": "..."}.
//   مشتری واردشده ← رویداد با user_id (lib/customer/events.ts)
//   مهمان ← رویداد با anon_id (کوکی yid؛ lib/site/guest.ts؛ بخش ۴۸)
//   کارمند واردشده ← هیچ؛ ربات و prefetch ← برای مهمان هیچ (مشتری واردشده مثل قبل)
// هر خطا ← ۲۰۴ (ثبت بازدید هرگز صفحه را خراب نمی‌کند).
const ok = () => new Response(null, { status: 204 });

export async function POST(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json")) return apiError(415, "json_required", "درخواست نامعتبر است.");
  try {
    const body = (await req.json().catch(() => null)) as { path?: unknown; referrer?: unknown } | null;
    const path = typeof body?.path === "string" ? body.path.slice(0, 300) : "";
    if (!path.startsWith("/")) return ok();
    const referrer = typeof body?.referrer === "string" ? body.referrer.slice(0, 500) : null;
    const a = await getAuth();
    if (a && !isCustomer(a.user)) return ok();
    const m = /^\/(p|c)\/([a-z0-9-]{1,120})$/.exec(path);
    const entityId = m ? (m[1] === "p" ? await publishedProductId(m[2]) : await visibleCategoryId(m[2])) : null;
    const type = m?.[1] === "p" ? ("product_view" as const) : ("category_view" as const);
    if (a) {
      await trackDailyVisit(a.user.id, path);
      if (entityId) await trackView({ userId: a.user.id, type, entityId, path, referrer });
      return ok();
    }
    // فیلتر ربات و prefetch فقط برای مهمان: مشتری واردشده مثل قبل شمرده می‌شود (ربات وارد حساب نمی‌شود؛
    // مرورگر تست Playwright «HeadlessChrome» است و مشتری‌های تست هم باید شمرده شوند)
    if (isBot(req.headers.get("user-agent")) || isPrefetch((n) => req.headers.get(n))) return ok();
    // IP فقط برای محدودیت سرعت در حافظه؛ ذخیره نمی‌شود
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    await trackGuest({ path, referrer, view: entityId ? { type, entityId } : null, ip });
  } catch (e) {
    console.error("events tracking failed:", e instanceof Error ? e.message : e);
  }
  return ok();
}
