import { apiError, apiJson } from "@/lib/api";
import { getProduct } from "@/lib/catalog/public";

// صفحه‌ی ترکیبی یک محصول: میانگین و بازه‌ی قیمت، مشخصات مشترک، عکس/ویدیو، قیمت تمام‌شده.
// اسم، آدرس، شناسه و لینک کارخانه‌ها در این خروجی نیست (در خود لایه‌ی داده اعمال شده، نه فقط در ظاهر).
export async function GET(_req: Request, ctx: RouteContext<"/api/v1/products/[slug]">) {
  const { slug } = await ctx.params;
  const p = await getProduct(slug);
  if (!p) return apiError(404, "product_not_found", "محصول پیدا نشد.");
  return apiJson({ product: p }, { cache: true });
}
