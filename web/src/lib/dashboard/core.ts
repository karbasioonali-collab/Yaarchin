// داشبورد پنل (بخش ۵۱): بخش خالص (بدون server-only تا تست واحد مستقیم اجرایش کند).
//   نمودار کوچک SVG بدون کتابخانه، رنگ انتظار گفتگو، موعد آزمون بعدی، زمان اجرای خودکار تحلیل و «چقدر مانده» برای دکمه‌ی تحلیل.
import { MIN_ACTIVE_DAYS, MIN_CHATS, MIN_PRODUCT_VIEWS } from "../reports/insight-core";
import { addDays, tehranYmd } from "../tehran-time";

const fa = (n: number) => n.toLocaleString("fa-IR");

// ---------- نمودار کوچک (sparkline) ----------
// نقطه‌ها از چپ به راست به ترتیب روز (قدیمی ← جدید). همه صفر ← خط صاف پایین. خروجی برای <polyline points> و <path d>.
export function sparkPath(values: number[], width = 120, height = 32, pad = 3): { line: string; area: string; points: { x: number; y: number }[] } {
  if (!values.length) return { line: "", area: "", points: [] };
  const max = Math.max(...values, 0);
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const y = (v: number) => (max > 0 ? height - pad - (v / max) * (height - pad * 2) : height - pad);
  const points = values.map((v, i) => ({ x: Math.round((pad + i * step) * 10) / 10, y: Math.round(y(v) * 10) / 10 }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const area = `M${first.x},${height - pad} ` + points.map((p) => `L${p.x},${p.y}`).join(" ") + ` L${last.x},${height - pad} Z`;
  return { line, area, points };
}

// ---------- گفتگوی منتظر ----------
// نارنجی = منتظر؛ قرمز = بیش از ۲ ساعت از آخرین پیام بی‌پاسخ مشتری
export const LATE_WAIT_MS = 2 * 60 * 60 * 1000;
export const waitTone = (since: Date, now: Date = new Date()): "wait" | "late" => (now.getTime() - since.getTime() > LATE_WAIT_MS ? "late" : "wait");

export function waitText(since: Date, now: Date = new Date()): string {
  const min = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60000));
  if (min < 1) return "همین حالا";
  if (min < 60) return `${fa(min)} دقیقه`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${fa(h)} ساعت`;
  return `${fa(Math.floor(h / 24))} روز`;
}

// ---------- آزمون دستیار ----------
// زمان‌بندی خودکار برای آزمون نیست؛ «آزمون بعدی» = موعد پیشنهادی: آخرین آزمون کامل + ai.test_stale_days.
// مدل یا دستورالعمل بعد از آخرین آزمون عوض شده، یا هرگز اجرا نشده ← «همین حالا لازم است».
export function nextTestDue(
  last: Date | null,
  staleDays: number,
  changed: boolean,
  now: Date = new Date(),
): { kind: "now"; reason: "never" | "changed" | "overdue" } | { kind: "due"; at: Date } {
  if (!last) return { kind: "now", reason: "never" };
  if (changed) return { kind: "now", reason: "changed" };
  const at = new Date(last.getTime() + staleDays * 86_400_000);
  return at.getTime() <= now.getTime() ? { kind: "now", reason: "overdue" } : { kind: "due", at };
}

// ---------- اجرای خودکار تحلیل (تصمیم مالک) ----------
// روزی یک بار، بعد از ساعت AUTO_INSIGHT_HOUR (پیش‌فرض ۶ صبح) تهران، روی «۷ روز تا پایان دیروز» (دیروز − ۶ تا دیروز).
// بازه‌ی یک‌روزه‌ی دیروز هرگز شرط «۳ روز با فعالیت» را ندارد؛ برای همین ۷ روز.
const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Tehran" });
export const tehranHour = (d: Date = new Date()): number => Number(hourFmt.format(d));

export function autoInsightHour(env: string | undefined): number {
  const n = Number(env);
  return env !== undefined && env !== "" && Number.isInteger(n) && n >= 0 && n <= 23 ? n : 6;
}
export const autoInsightDue = (now: Date, hour: number): boolean => tehranHour(now) >= hour;
export function autoInsightRange(now: Date = new Date()): { from: string; to: string; days: number } {
  const y = addDays(tehranYmd(now), -1);
  return { from: addDays(y, -6), to: y, days: 7 };
}

// ---------- «چقدر مانده» برای دکمه‌ی تحلیل (گزارش‌ها) ----------
// شرط: (۳۰ بازدید محصول یا ۵ گفتگو) و ۳ روز با فعالیت. فقط بخش‌هایی که کم است گفته می‌شود.
export function insightMissing(c: { productViews: number; newChats: number }, activeDays: number): string[] {
  const out: string[] = [];
  if (c.productViews < MIN_PRODUCT_VIEWS && c.newChats < MIN_CHATS)
    out.push(`${fa(c.productViews)} بازدید محصول از ${fa(MIN_PRODUCT_VIEWS)} لازم (یا ${fa(c.newChats)} گفتگو از ${fa(MIN_CHATS)})`);
  if (activeDays < MIN_ACTIVE_DAYS) out.push(`${fa(activeDays)} روز با فعالیت از ${fa(MIN_ACTIVE_DAYS)} لازم`);
  return out;
}

// ---------- کش کوتاه داخل حافظه ----------
// برای شمارش‌های سنگین داشبورد (۶۰ ثانیه). فقط همان پروسه؛ بدون تغییر دیتابیس. کلید باید همه‌ی ورودی‌ها را داشته باشد.
export class TtlCache {
  private store: Map<string, { at: number; value: unknown }>;
  private ttlMs: number;
  constructor(ttlMs: number) {
    this.store = new Map();
    this.ttlMs = ttlMs;
  }
  async get<T>(key: string, load: () => Promise<T>, now: number = Date.now()): Promise<T> {
    const hit = this.store.get(key);
    if (hit && now - hit.at < this.ttlMs) return hit.value as T;
    const value = await load();
    this.store.set(key, { at: now, value });
    if (this.store.size > 200) this.store.delete(this.store.keys().next().value as string);
    return value;
  }
  clear(): void {
    this.store.clear();
  }
}
