import "server-only";
// قیمت تمام‌شده‌ی رسیده به ایران (landedCostFor). اصل ۱۱: عدد فقط از جدول‌های نرخ و ماشین‌حساب می‌آید، هرگز از AI و هرگز حدسی.
// هیچ عدد تومانی ذخیره نمی‌شود؛ هر بار با آخرین نرخ‌ها حساب می‌شود، پس با ثبت نرخ تازه همه‌ی قیمت‌های سایت خودکار عوض می‌شوند.
// ساختار: snapshot.ts (خواندن نرخ‌ها و قیمت‌ها) ← compute.ts (محاسبه‌ی خالص) ← اینجا (رابط سایت و پنل).
import { ratesReady } from "@/lib/db-ready";
import { computeLanded, type LandedResult, type PublicLanded, toPublic } from "./compute";
import { landedInput, rateSnapshot } from "./snapshot";

export const MAX_QTY = 1_000_000;
export function clampQty(raw: unknown, fallback: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return Math.min(Math.max(1, fallback), MAX_QTY);
  return Math.min(n, MAX_QTY);
}

// ریز کامل محاسبه (پنل). null = migration ۰۰۰۵ هنوز اجرا نشده یا محصول نیست.
export async function landedCostFor(input: { productId: string; qty: number; at?: Date }): Promise<LandedResult | null> {
  if (!(await ratesReady())) return null;
  const li = await landedInput(input.productId, input.qty);
  if (!li) return null;
  const snap = await rateSnapshot(li.hsCode ?? "", input.at ? input.at.toISOString() : null);
  return computeLanded(li, snap);
}

// برای سایت: فقط روش‌های فعال و عددهای گردشده. «soon» = جدول‌های نرخ هنوز ساخته نشده‌اند.
export type LandedCost = { status: "soon" } | ({ status: "ready" } & PublicLanded);

export async function publicLandedCost(productId: string, qty: number): Promise<LandedCost> {
  const r = await landedCostFor({ productId, qty });
  if (!r) return { status: "soon" };
  return { status: "ready", ...toPublic(r) };
}
