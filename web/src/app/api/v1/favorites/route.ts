import { apiError, apiJson, comingSoon, featureOff, loginRequired } from "@/lib/api";
import { getAuth } from "@/lib/auth/current";
import { publishedProductId } from "@/lib/catalog/public";
import { isCustomer } from "@/lib/customer/auth";
import { setFavorite } from "@/lib/customer/favorites";
import { customerReady } from "@/lib/db-ready";
import { isEnabled } from "@/lib/settings";

// افزودن (POST) و حذف (DELETE) علاقه‌مندی. بدنه: {"product": "<slug>"}. فقط مشتری واردشده.
// ضد CSRF: کوکی نشست SameSite=Lax است (در POST از سایت دیگر فرستاده نمی‌شود) و فقط JSON پذیرفته می‌شود
// (فرم HTML سایت دیگر نمی‌تواند JSON بفرستد).
async function handle(req: Request, on: boolean) {
  if (!(await isEnabled("favorites"))) return featureOff();
  if (!req.headers.get("content-type")?.includes("application/json")) return apiError(415, "json_required", "درخواست نامعتبر است.");
  const a = await getAuth();
  if (!a) return loginRequired();
  if (!isCustomer(a.user)) return apiError(403, "customers_only", "علاقه‌مندی مخصوص حساب مشتری است.");
  if (!(await customerReady())) return comingSoon();
  const body = (await req.json().catch(() => null)) as { product?: unknown } | null;
  const slug = typeof body?.product === "string" ? body.product : "";
  const productId = /^[a-z0-9-]{1,120}$/.test(slug) ? await publishedProductId(slug) : null;
  if (!productId) return apiError(404, "not_found", "محصول پیدا نشد.");
  await setFavorite(a.user.id, productId, on, `/p/${slug}`);
  return apiJson({ product: slug, favorite: on });
}

export const POST = (req: Request) => handle(req, true);
export const DELETE = (req: Request) => handle(req, false);
