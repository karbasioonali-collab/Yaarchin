import { apiError, apiJson } from "@/lib/api";
import { landedForSlug } from "@/lib/catalog/public";

// قیمت تمام‌شده تا ایران برای تعداد دلخواه: ?qty=500 (پیش‌فرض: حداقل سفارش؛ بین ۱ و ۱٬۰۰۰٬۰۰۰).
// فقط روش‌های حمل فعال، عدد گردشده (نزدیک‌ترین ۱٬۰۰۰ تومان)، زمان کل و تاریخ نرخ‌ها. قیمت یا اسم کارخانه‌ها در خروجی نیست.
// status = "soon" یعنی جدول‌های نرخ هنوز ساخته نشده‌اند. کش کوتاه: نرخ تازه حداکثر یک دقیقه بعد دیده می‌شود.
export async function GET(req: Request, ctx: RouteContext<"/api/v1/products/[slug]/landed">) {
  const { slug } = await ctx.params;
  const r = await landedForSlug(slug, new URL(req.url).searchParams.get("qty"));
  if (!r) return apiError(404, "product_not_found", "محصول پیدا نشد.");
  return apiJson({ landed: r }, { cache: true });
}
