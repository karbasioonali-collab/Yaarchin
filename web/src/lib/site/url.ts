import "server-only";
import { headers } from "next/headers";

// آدرس اصلی سایت از یک تنظیم واحد: متغیر محیطی SITE_URL در لیارا (مثل https://zedplan.ir؛ بعداً https://yaarchin.ir).
// هیچ‌جای کد نباید دامنه را ثابت بنویسد. تغییر دامنه = فقط عوض کردن SITE_URL در لیارا و restart، بدون تغییر کد.
// docs/infoyaarchin.md بخش ۲۳.

// SITE_URL معتبر (فقط http/https، بدون مسیر و اسلش آخر) یا null. مقدار غلط نادیده گرفته می‌شود و در لاگ هشدار می‌آید.
export function siteUrl(): string | null {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("protocol");
    return u.origin;
  } catch {
    console.warn(`SITE_URL نامعتبر است و نادیده گرفته شد: ${raw}`);
    return null;
  }
}

// آدرس مطلق یک مسیر (برای لینک داخل پیامک، ایمیل و …). اگر SITE_URL تنظیم نشده باشد، از هدرهای همان درخواست
// (پشت پراکسی لیارا: x-forwarded-host و x-forwarded-proto) ساخته می‌شود؛ خارج از درخواست (مثلاً زمان‌بند) null.
export async function absoluteUrl(path: string): Promise<string | null> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = siteUrl();
  if (base) return base + p;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}${p}`;
  } catch {
    return null;
  }
}
