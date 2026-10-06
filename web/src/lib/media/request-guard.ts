import "server-only";
// ضد CSRF مشترک مسیرهای آپلود و وارد کردن از لینک: هدر سفارشی x-yc-upload (فرم یا سایت دیگر بدون preflight نمی‌تواند
// هدر سفارشی بفرستد) + یکی بودن Origin با میزبان (پشت پراکسی لیارا: x-forwarded-host).
import type { NextRequest } from "next/server";

export function isTrustedPanelRequest(req: NextRequest): boolean {
  if (req.headers.get("x-yc-upload") !== "1") return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
