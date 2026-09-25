import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { getCategoryPage, listProducts } from "@/lib/catalog/public";

// فهرست محصولات منتشرشده؛ ?category=<slug> (با همه‌ی زیرشاخه‌ها) و ?limit=. برای همه آزاد.
// خروجی فقط از lib/catalog/public می‌آید که هیچ فیلد شناسایی کارخانه ندارد.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 24));
  const category = sp.get("category");
  if (category) {
    const page = await getCategoryPage(category);
    if (!page) return apiError(404, "category_not_found", "دسته پیدا نشد.");
    return apiJson({ products: await listProducts({ categoryIds: page.ids, limit }) }, { cache: true });
  }
  return apiJson({ products: await listProducts({ limit }) }, { cache: true });
}
