import "server-only";
// نگهبان مشترک APIهای چت مشتری (/api/v1/chat/...): سوئیچ features.chat، migration ۰۰۰۶، مشتری واردشده.
// ضد CSRF مثل بقیه‌ی APIهای مشتری: کوکی SameSite=Lax و فقط بدنه‌ی JSON (فرم HTML سایت دیگر JSON نمی‌فرستد).
import { apiError, comingSoon, featureOff, loginRequired } from "@/lib/api";
import { getAuth } from "@/lib/auth/current";
import type { AuthState } from "@/lib/auth/current";
import { isCustomer } from "@/lib/customer/auth";
import { chatReady } from "@/lib/db-ready";
import { isEnabled } from "@/lib/settings";

export async function chatCustomerGuard(req: Request, opts: { json: boolean }): Promise<{ a: AuthState } | { res: Response }> {
  if (!(await isEnabled("chat"))) return { res: featureOff() };
  if (opts.json && !req.headers.get("content-type")?.includes("application/json")) return { res: apiError(415, "json_required", "درخواست نامعتبر است.") };
  const a = await getAuth();
  if (!a) return { res: loginRequired() };
  if (!isCustomer(a.user)) return { res: apiError(403, "customers_only", "گفتگو مخصوص حساب مشتری است. کارشناسان از پنل («گفتگوها») پاسخ می‌دهند.") };
  if (!(await chatReady())) return { res: comingSoon() };
  return { a };
}
