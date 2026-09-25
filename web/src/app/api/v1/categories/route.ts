import { apiJson } from "@/lib/api";
import { getCategoryTree } from "@/lib/catalog/public";

// درخت دسته‌بندی‌ها (عمق نامحدود). برای همه آزاد.
export async function GET() {
  return apiJson({ categories: await getCategoryTree() }, { cache: true });
}
