import "server-only";
// شمردن بازدید مهمان (بخش ۴۸). منطق خالص در guest-core.ts.
//   ثبت: همان نوع‌های مشتری (site_visit روزانه، product_view، category_view) با user_id خالی و anon_id = کوکی yid.
//   هیچ IP یا user agent یا اطلاعات شخصی ذخیره نمی‌شود. هر خطا در API گرفته می‌شود (صفحه هرگز خراب یا کند نمی‌شود).
//   ورود/ثبت‌نام مشتری: رویدادهای ۹۰ روز اخیر همان مرورگر به حسابش وصل می‌شود. ورود کارمند: آن مرورگر دیگر شمرده نمی‌شود.
//   پاک‌سازی: رویداد مهمانِ وصل‌نشده بعد از ۱۸۰ روز (زمان‌بند هر دقیقه، هر بار حداکثر ۵۰۰۰ ردیف).
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { events } from "@/db/schema";
import {
  GUEST_COOKIE,
  GUEST_COOKIE_DAYS,
  GUEST_DAILY_EVENT_CAP,
  GUEST_MERGE_DAYS,
  GUEST_PER_MINUTE,
  GUEST_RETENTION_DAYS,
  GUEST_VIEW_DEDUPE_MS,
  IP_PER_MINUTE,
  MinuteLimiter,
  NO_TRACK_COOKIE,
  newGuestId,
  validGuestId,
} from "./guest-core";

const perGuest = new MinuteLimiter(GUEST_PER_MINUTE);
const perIp = new MinuteLimiter(IP_PER_MINUTE);
const cookieOpts = (days: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: days * 86400,
});
const todayStart = sql`(date_trunc('day', now() at time zone 'Asia/Tehran') at time zone 'Asia/Tehran')`;

// شناسه‌ی مهمان این مرورگر؛ اگر نبود ساخته و در کوکی گذاشته می‌شود. null = این مرورگر نباید شمرده شود (کارمند)
async function guestId(create: boolean): Promise<string | null> {
  const jar = await cookies();
  if (jar.get(NO_TRACK_COOKIE)?.value) return null;
  const cur = jar.get(GUEST_COOKIE)?.value;
  if (validGuestId(cur)) return cur;
  if (!create) return null;
  const id = newGuestId();
  jar.set(GUEST_COOKIE, id, cookieOpts(GUEST_COOKIE_DAYS));
  return id;
}

export type GuestView = { type: "product_view" | "category_view"; entityId: string } | null;

// ثبت یک بازدید مهمان. ip فقط برای محدودیت سرعت در حافظه است و ذخیره نمی‌شود.
// خروجی برای تست و لاگ: چه شد (هیچ‌وقت خطا پرتاب نمی‌کند؛ صدا زننده هم try/catch دارد)
export async function trackGuest(o: { path: string; referrer: string | null; view: GuestView; ip: string | null }): Promise<string> {
  const anonId = await guestId(true);
  if (!anonId) return "no_track";
  if (o.ip && !perIp.hit(o.ip)) return "ip_limit";
  if (!perGuest.hit(anonId)) return "guest_limit";
  const [today] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(events)
    .where(and(eq(events.anonId, anonId), isNull(events.userId), sql`${events.occurredAt} >= ${todayStart}`));
  if ((today?.n ?? 0) >= GUEST_DAILY_EVENT_CAP) return "daily_cap";
  const base = { userId: null, anonId, path: o.path.slice(0, 500), referrer: o.referrer?.slice(0, 500) ?? null, userAgent: null, props: {} };
  // «ورود به سایت»: یک بار در هر روز تهران
  const [visit] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.anonId, anonId), eq(events.type, "site_visit"), sql`${events.occurredAt} >= ${todayStart}`))
    .limit(1);
  if (!visit) await db.insert(events).values({ ...base, type: "site_visit" });
  if (!o.view) return "visit";
  // یک محصول یا دسته در ۳۰ دقیقه یک بار
  const [recent] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.anonId, anonId), eq(events.type, o.view.type), eq(events.entityId, o.view.entityId), gt(events.occurredAt, new Date(Date.now() - GUEST_VIEW_DEDUPE_MS))))
    .limit(1);
  if (recent) return "dedupe";
  await db.insert(events).values({ ...base, type: o.view.type, entityType: o.view.type === "product_view" ? "product" : "category", entityId: o.view.entityId });
  return "view";
}

// ورود یا ثبت‌نام مشتری: بازدیدهای مهمانِ ۹۰ روز اخیر همین مرورگر به حسابش وصل می‌شود.
// «ورود به سایت»ِ تکراری در یک روز تهران (مهمان + مشتری) یکی می‌شود تا شمارش روزها درست بماند.
export async function mergeGuestInto(userId: string): Promise<number> {
  const anonId = await guestId(false);
  if (!anonId) return 0;
  const r = await db.execute(sql`
    update events set user_id = ${userId}
    where anon_id = ${anonId} and user_id is null and occurred_at > now() - make_interval(days => ${GUEST_MERGE_DAYS})`);
  if (r.rowCount) {
    await db.execute(sql`
      delete from events e using events o
      where e.user_id = ${userId} and o.user_id = ${userId} and e.type = 'site_visit' and o.type = 'site_visit' and o.id < e.id
        and (o.occurred_at at time zone 'Asia/Tehran')::date = (e.occurred_at at time zone 'Asia/Tehran')::date`);
  }
  return r.rowCount ?? 0;
}

// ورود کارمند: این مرورگر دیگر مهمان شمرده نمی‌شود و بازدیدهای مهمانِ قبلی‌اش (وصل‌نشده) پاک می‌شود
export async function markStaffBrowser(): Promise<void> {
  const jar = await cookies();
  const cur = jar.get(GUEST_COOKIE)?.value;
  jar.set(NO_TRACK_COOKIE, "1", cookieOpts(GUEST_COOKIE_DAYS));
  if (validGuestId(cur)) await db.delete(events).where(and(eq(events.anonId, cur), isNull(events.userId)));
}

// پاک‌سازی رویدادهای مهمانِ وصل‌نشده‌ی قدیمی‌تر از ۱۸۰ روز (هر بار حداکثر ۵۰۰۰ ردیف؛ رویداد مشتری هرگز)
export async function cleanupGuestEvents(): Promise<number> {
  const r = await db.execute(sql`
    delete from events where id in (
      select id from events
      where user_id is null and anon_id is not null and occurred_at < now() - make_interval(days => ${GUEST_RETENTION_DAYS})
      limit 5000)`);
  return r.rowCount ?? 0;
}
