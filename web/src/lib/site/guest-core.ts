// شمردن بازدید مهمان (بخش ۴۸): بخش خالص (بدون server-only تا تست واحد مستقیم اجرایش کند).
// شناسه‌ی مهمان (کوکی yid) تصادفی است و هیچ اطلاعات شخصی ندارد. IP و user agent مهمان ذخیره نمی‌شود.

export const GUEST_COOKIE = "yid";
// مرورگری که یک بار کارمند در آن وارد پنل شده: هرگز به‌عنوان مهمان شمرده نمی‌شود
export const NO_TRACK_COOKIE = "ynt";
export const GUEST_COOKIE_DAYS = 365;
// یک محصول یا دسته توسط یک مهمان در این فاصله یک بار (مشتری: ۱۰ دقیقه، lib/customer/events.ts)
export const GUEST_VIEW_DEDUPE_MS = 30 * 60 * 1000;
// سقف رویداد هر مهمان در روز تهران (رفتار غیرعادی یا ربات)
export const GUEST_DAILY_EVENT_CAP = 200;
// رویداد مهمانِ وصل‌نشده بعد از این مدت پاک می‌شود؛ وصل شدن به حساب بعد از ورود فقط برای این مدت اخیر
export const GUEST_RETENTION_DAYS = 180;
export const GUEST_MERGE_DAYS = 90;
// محدودیت سرعت (فقط در حافظه): اصلی بر اساس شناسه‌ی مهمان؛ IP فقط برای جلوگیری از حمله و خیلی بالاتر،
// چون اپراتورهای موبایل (CGNAT) کاربرهای زیادی را پشت یک IP می‌گذارند. IP هرگز ذخیره نمی‌شود.
export const GUEST_PER_MINUTE = 30;
export const IP_PER_MINUTE = 600;

// ۱۲۸ بیت تصادفی، base64url (۲۲ نویسه)
export function newGuestId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export const validGuestId = (v: string | undefined | null): v is string => !!v && /^[A-Za-z0-9_-]{22}$/.test(v);

// ربات‌ها و ابزارها (اکثرشان جاوااسکریپت اجرا نمی‌کنند و به این API نمی‌رسند؛ این برای آن‌هایی است که اجرا می‌کنند)
const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|mediapartners|bingpreview|facebookexternalhit|embedly|headless|phantomjs|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl\/|wget\/|python|java\/|go-http|okhttp|axios|node-fetch|httpclient|libwww|scrapy|preview/i;
export function isBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  return ua.length < 10 || BOT_UA.test(ua);
}

// prefetch یا prerender مرورگر (Chrome: Sec-Purpose: prefetch؛ قدیمی: Purpose: prefetch / X-Moz: prefetch)
export function isPrefetch(get: (name: string) => string | null): boolean {
  return [get("sec-purpose"), get("purpose"), get("x-purpose"), get("x-moz")].some((v) => !!v && /prefetch|prerender|preview/i.test(v));
}

// شمارنده‌ی پنجره‌ی ثابت یک‌دقیقه‌ای در حافظه (یک نسخه‌ی برنامه در لیارا). now تزریقی برای تست.
export class MinuteLimiter {
  // (بدون «parameter property» در constructor: اجرای مستقیم TypeScript در تست واحد آن را نمی‌پذیرد)
  private counts = new Map<string, { start: number; n: number }>();
  private readonly limit: number;
  private readonly now: () => number;
  private readonly maxKeys: number;
  constructor(limit: number, now: () => number = Date.now, maxKeys = 50_000) {
    this.limit = limit;
    this.now = now;
    this.maxKeys = maxKeys;
  }
  // true = مجاز (و شمرده شد)
  hit(key: string): boolean {
    const t = this.now();
    const c = this.counts.get(key);
    if (!c || t - c.start >= 60_000) {
      // حافظه محدود بماند (۵۱۲ مگابایت): اگر کلیدها زیاد شد، پنجره‌های تمام‌شده پاک می‌شوند
      if (this.counts.size >= this.maxKeys) for (const [k, v] of this.counts) if (t - v.start >= 60_000) this.counts.delete(k);
      if (this.counts.size >= this.maxKeys) return false;
      this.counts.set(key, { start: t, n: 1 });
      return true;
    }
    c.n++;
    return c.n <= this.limit;
  }
}
