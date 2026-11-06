// ویدیو محصول با لینک آپارات (بخش ۵۵). خالص (بدون server-only)؛ تست واحد مستقیم اجرایش می‌کند و گالری سایت (کلاینت) هم.
// ذخیره بدون migration: یک ردیف product_media با kind = video و storage_key = «aparat:<کد>» (فقط کد، نه لینک کامل).
// لینک‌های پذیرفته (با/بدون https، با/بدون www یا m.، با اسم یا پارامتر بعد از کد):
//   https://www.aparat.com/v/<کد>   https://aparat.com/v/<کد>/اسم-ویدیو?x=1   www.aparat.com/v/<کد>
//   و لینک پخش‌کننده‌ی جاسازی: https://www.aparat.com/video/video/embed/videohash/<کد>/vt/frame
// کد = ۳ تا ۱۶ حرف و رقم انگلیسی. هر دامنه یا مسیر دیگر ← خطای فارسی.

export const APARAT_PREFIX = "aparat:";
const HASH_RE = /^[A-Za-z0-9]{3,16}$/;
const HOSTS = new Set(["aparat.com", "www.aparat.com", "m.aparat.com"]);

export const isAparatKey = (key: string | null | undefined): boolean => !!key && key.startsWith(APARAT_PREFIX) && HASH_RE.test(key.slice(APARAT_PREFIX.length));
export const aparatHash = (key: string): string | null => (isAparatKey(key) ? key.slice(APARAT_PREFIX.length) : null);
export const aparatKey = (hash: string) => `${APARAT_PREFIX}${hash}`;
export const aparatPageUrl = (hash: string) => `https://www.aparat.com/v/${hash}`;
// پخش‌کننده‌ی جاسازی (iframe ساده، بدون اسکریپت آپارات). recom=self: پیشنهادهای بعد از پایان فقط از همان کانال (خواسته‌ی مالک).
export const aparatEmbedUrl = (hash: string) => `https://www.aparat.com/video/video/embed/videohash/${hash}/vt/frame?recom=self`;

export const APARAT_ERR = {
  empty: "لینک ویدیو را وارد کنید.",
  notLink: "این متن لینک نیست. لینک صفحه‌ی ویدیو را از نوار آدرس آپارات کپی کنید؛ مثل https://www.aparat.com/v/abc12",
  otherSite: "فقط لینک ویدیوی آپارات (aparat.com) پذیرفته می‌شود.",
  notVideo: "این لینک صفحه‌ی یک ویدیو نیست (مثلاً صفحه‌ی کانال یا جستجو). خود ویدیو را در آپارات باز کنید و لینک آن را کپی کنید؛ شکل درست: https://www.aparat.com/v/abc12",
} as const;

// متن کاربر ← کد ویدیو، یا پیام خطا
export function parseAparatLink(raw: string): { hash: string } | { error: string } {
  // نویسه‌های نامرئی که موقع کپی از متن فارسی می‌آیند (RLM، LRM، ZWJ، ZWNJ، BOM) و فاصله‌ها
  const s = raw.replace(/[​-‏‪-‮⁦-⁩﻿]/g, "").trim();
  if (!s) return { error: APARAT_ERR.empty };
  if (/\s/.test(s)) return { error: APARAT_ERR.notLink };
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return { error: APARAT_ERR.notLink };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { error: APARAT_ERR.notLink };
  const host = u.hostname.toLowerCase();
  if (!host.includes(".")) return { error: APARAT_ERR.notLink };
  if (!HOSTS.has(host)) return { error: APARAT_ERR.otherSite };
  if (u.username || u.password || (u.port && u.port !== "443" && u.port !== "80")) return { error: APARAT_ERR.otherSite };
  const path = decodeURIComponent(u.pathname);
  const m = /^\/v\/([^/]+)(?:\/.*)?$/.exec(path) ?? /^\/video\/video\/embed\/videohash\/([^/]+)(?:\/.*)?$/.exec(path);
  if (!m || !HASH_RE.test(m[1])) return { error: APARAT_ERR.notVideo };
  return { hash: m[1] };
}
