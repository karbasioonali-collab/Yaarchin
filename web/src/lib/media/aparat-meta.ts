import "server-only";
// اطلاعات ویدیو از oEmbed آپارات (بخش ۵۵): عنوان و عکس پیش‌نمایش موقع ذخیره‌ی لینک، و «هنوز هست؟» برای صفحه‌ی محصول.
// شکست (قطعی، کندی، شکل ناشناخته) هرگز جلوی ذخیره یا نمایش را نمی‌گیرد؛ فقط جواب ۴۰۴ صریح یعنی «حذف یا خصوصی شده».
// APARAT_OEMBED_BASE فقط برای تست e2e (mock-ai.mjs)؛ روی لیارا تعریف نشود.
import { TtlCache } from "@/lib/dashboard/core";
import { aparatPageUrl } from "./aparat";

const TIMEOUT_MS = 4000;
const MAX_BYTES = 64 * 1024;
const base = () => (process.env.APARAT_OEMBED_BASE ?? "").trim().replace(/\/+$/, "") || "https://www.aparat.com";

// عکس پیش‌نمایش فقط از دامنه‌های آپارات (و در تست، از سرور mock)
export function okThumb(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase();
    return h === "aparat.com" || h.endsWith(".aparat.com") || h.endsWith(".aparat.cloud") ? u.toString() : null;
  } catch {
    return null;
  }
}

export type AparatInfo = { status: "ok"; title: string | null; thumbnail: string | null } | { status: "gone" } | { status: "unknown" };

export async function aparatInfo(hash: string): Promise<AparatInfo> {
  const url = `${base()}/oembed?url=${encodeURIComponent(aparatPageUrl(hash))}&format=json`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal, redirect: "follow", headers: { accept: "application/json" } });
    if (r.status === 404) return { status: "gone" };
    if (!r.ok) return { status: "unknown" };
    const text = (await r.text()).slice(0, MAX_BYTES);
    const j = JSON.parse(text) as Record<string, unknown>;
    const title = typeof j.title === "string" && j.title.trim() ? j.title.trim().slice(0, 200) : null;
    return { status: "ok", title, thumbnail: okThumb(j.thumbnail_url) };
  } catch {
    return { status: "unknown" };
  } finally {
    clearTimeout(t);
  }
}

// برای صفحه‌ی محصول و پنل: ۶ ساعت کش در حافظه (هر کد جدا؛ صفحه‌ی محصول برای هر بازدید به آپارات درخواست نمی‌فرستد)
const ttl = Number(process.env.APARAT_CHECK_CACHE_MS);
const cache = new TtlCache(process.env.APARAT_CHECK_CACHE_MS !== undefined && Number.isFinite(ttl) && ttl >= 0 ? ttl : 6 * 60 * 60 * 1000);
export const aparatGone = async (hash: string): Promise<boolean> => (await cache.get(`ap:${hash}`, () => aparatInfo(hash))).status === "gone";

// «حذف یا خصوصی شده» فقط وقتی پنهان می‌شود که عکس پیش‌نمایش از خود oEmbed آمده باشد (یعنی oEmbed برای این ویدیو کار کرده بود).
// اگر روزی آدرس oEmbed آپارات عوض شود و برای همه ۴۰۴ بدهد، ویدیوهایی که oEmbed هرگز برایشان کار نکرد پنهان نمی‌شوند.
export const aparatHidden = async (hash: string, posterKey: string | null): Promise<boolean> => !!okThumb(posterKey) && (await aparatGone(hash));
