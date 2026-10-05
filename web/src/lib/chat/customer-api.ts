import "server-only";
// نگهبان مشترک APIهای چت مشتری (/api/v1/chat/...): سوئیچ features.chat، migration ۰۰۰۶، مشتری واردشده.
// ضد CSRF مثل بقیه‌ی APIهای مشتری: کوکی SameSite=Lax و فقط بدنه‌ی JSON (فرم HTML سایت دیگر JSON نمی‌فرستد).
import { apiError, comingSoon, featureOff, loginRequired } from "@/lib/api";
import { getAuth } from "@/lib/auth/current";
import type { AuthState } from "@/lib/auth/current";
import { isCustomer } from "@/lib/customer/auth";
import { chatReady } from "@/lib/db-ready";
import { isEnabled } from "@/lib/settings";
import { absoluteUrl } from "@/lib/site/url";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { alertNewChat } from "./alerts";
import type { CustomerPostResult } from "./service";

export async function chatCustomerGuard(req: Request, opts: { json: boolean }): Promise<{ a: AuthState } | { res: Response }> {
  if (!(await isEnabled("chat"))) return { res: featureOff() };
  if (opts.json && !req.headers.get("content-type")?.includes("application/json")) return { res: apiError(415, "json_required", "درخواست نامعتبر است.") };
  const a = await getAuth();
  if (!a) return { res: loginRequired() };
  if (!isCustomer(a.user)) return { res: apiError(403, "customers_only", "گفتگو مخصوص حساب مشتری است. کارشناسان از پنل («گفتگوها») پاسخ می‌دهند.") };
  if (!(await chatReady())) return { res: comingSoon() };
  return { a };
}

// گفتگو تازه به صف «ارجاع‌نشده» آمد ← هشدار پیامکی به کسانی که ارجاع می‌دهند، بعد از فرستادن پاسخ به مشتری (after)
// تا کندی یا خطای پیامک پاسخ مشتری را معطل نکند. لینک قبل از after ساخته می‌شود (هدرهای درخواست).
export async function queueNewChatAlert(r: CustomerPostResult, customerName: string): Promise<void> {
  if (!r.queued) return;
  const c = r.conversation;
  const link = await absoluteUrl(`/admin/chats/${c.id}`);
  after(async () => {
    try {
      const [p] = c.productId ? await db.select({ t: products.titleFa }).from(products).where(eq(products.id, c.productId)) : [];
      await alertNewChat({ conversationId: c.id, customerName, topic: p?.t ?? c.subject, link });
    } catch (e) {
      console.error("new chat alert failed", e);
    }
  });
}
