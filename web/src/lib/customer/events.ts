import "server-only";
import { and, count, countDistinct, desc, eq, gt, inArray, max, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { events } from "@/db/schema";
import { requestMeta } from "@/lib/request";

// ثبت رفتار مشتری واردشده در جدول events (فقط افزودنی). به مشتری فقط «بازدیدهای اخیر» نشان داده می‌شود.
// هدف: امتیاز جدیت مشتری (lead scoring) و گزارش روزانه در مراحل بعد، بدون تغییر ساختار.
// نوع‌ها (ستون type). نوع تازه = یک مقدار تازه اینجا؛ جدول تغییر نمی‌کند. docs/infoyaarchin.md بخش ۱۸.
export const EVENT_TYPES = {
  product_view: "بازدید محصول", // entity: product
  category_view: "بازدید دسته", // entity: category
  site_visit: "ورود به سایت (روزانه)", // حداکثر یکی در هر روز (به وقت تهران)
  login: "ورود به حساب", // props.method: password | sms | signup
  signup: "ثبت‌نام",
  favorite_add: "افزودن به علاقه‌مندی", // entity: product
  favorite_remove: "حذف از علاقه‌مندی", // entity: product
} as const;
export type EventType = keyof typeof EVENT_TYPES;

// رفرش پشت‌سرهمِ همان صفحه در این فاصله دوباره ثبت نمی‌شود (trackView)
const VIEW_DEDUPE_MS = 10 * 60 * 1000;

export async function trackEvent(e: {
  userId: string;
  type: EventType;
  entityType?: "product" | "category";
  entityId?: string;
  path?: string | null;
  referrer?: string | null;
  props?: Record<string, unknown>;
}): Promise<void> {
  const { userAgent } = await requestMeta();
  await db.insert(events).values({
    userId: e.userId,
    type: e.type,
    entityType: e.entityType ?? null,
    entityId: e.entityId ?? null,
    path: e.path?.slice(0, 500) ?? null,
    referrer: e.referrer?.slice(0, 500) ?? null,
    props: e.props ?? {},
    userAgent,
  });
}

// بازدید صفحه‌ی محصول یا دسته. true یعنی ثبت شد.
// تکرار پشت‌سرهم (رفرش): اگر آخرین بازدیدِ همین نوع در ۱۰ دقیقه‌ی اخیر همین صفحه بوده، دوباره ثبت نمی‌شود.
// ولی A ← B ← A دوباره ثبت می‌شود تا «بازدیدهای اخیر» ترتیب درست داشته باشد.
export async function trackView(e: {
  userId: string;
  type: "product_view" | "category_view";
  entityId: string;
  path: string;
  referrer: string | null;
}): Promise<boolean> {
  const [last] = await db
    .select({ entityId: events.entityId })
    .from(events)
    .where(and(eq(events.userId, e.userId), eq(events.type, e.type), gt(events.occurredAt, new Date(Date.now() - VIEW_DEDUPE_MS))))
    .orderBy(desc(events.occurredAt))
    .limit(1);
  if (last?.entityId === e.entityId) return false;
  await trackEvent({ ...e, entityType: e.type === "product_view" ? "product" : "category" });
  return true;
}

// «ورود به سایت»: اولین صفحه‌ای که مشتری در هر روز (به وقت تهران) باز می‌کند
export async function trackDailyVisit(userId: string, path: string): Promise<void> {
  const [today] = await db
    .select({ n: count() })
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        eq(events.type, "site_visit"),
        sql`${events.occurredAt} >= (date_trunc('day', now() at time zone 'Asia/Tehran') at time zone 'Asia/Tehran')`,
      ),
    );
  if (today.n === 0) await trackEvent({ userId, type: "site_visit", path });
}

// شناسه‌ی آخرین محصولات دیده‌شده (جدیدترین اول، بدون تکرار)
export async function recentProductIds(userId: string, limit = 24): Promise<string[]> {
  const rows = await db
    .select({ id: events.entityId, last: max(events.occurredAt) })
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.type, "product_view")))
    .groupBy(events.entityId)
    .orderBy(desc(max(events.occurredAt)))
    .limit(limit);
  return rows.map((r) => r.id).filter((id): id is string => !!id);
}

// خلاصه‌ی رفتار برای پنل ادمین (صفحه‌ی مشتری)
export async function behaviorSummary(userId: string) {
  const since = (days: number) => new Date(Date.now() - days * 86400 * 1000);
  const countOf = async (types: EventType[], from?: Date) => {
    const [r] = await db
      .select({ n: count() })
      .from(events)
      .where(and(eq(events.userId, userId), inArray(events.type, types), from ? gt(events.occurredAt, from) : undefined));
    return r.n;
  };
  const top = async (type: "product_view" | "category_view") =>
    db
      .select({ id: events.entityId, n: count(), last: max(events.occurredAt) })
      .from(events)
      .where(and(eq(events.userId, userId), eq(events.type, type)))
      .groupBy(events.entityId)
      .orderBy(desc(count()), desc(max(events.occurredAt)))
      .limit(5);
  const [views7, views30, viewsAll, catViews30, logins, visits30, favAdds, favRemoves, topProducts, topCategories, [last], [distinct]] =
    await Promise.all([
      countOf(["product_view"], since(7)),
      countOf(["product_view"], since(30)),
      countOf(["product_view"]),
      countOf(["category_view"], since(30)),
      countOf(["login"]),
      countOf(["site_visit"], since(30)),
      countOf(["favorite_add"]),
      countOf(["favorite_remove"]),
      top("product_view"),
      top("category_view"),
      db.select({ at: max(events.occurredAt) }).from(events).where(eq(events.userId, userId)),
      db
        .select({ n: countDistinct(events.entityId) })
        .from(events)
        .where(and(eq(events.userId, userId), eq(events.type, "product_view"))),
    ]);
  return {
    views7,
    views30,
    viewsAll,
    distinctProducts: distinct.n,
    catViews30,
    logins,
    visits30,
    favAdds,
    favRemoves,
    topProducts,
    topCategories,
    lastSeenAt: last?.at ?? null,
  };
}

// بازدیدهای ۳۰ روز اخیر برای چند مشتری (ستون فهرست مشتریان)
export async function views30For(userIds: string[]): Promise<Map<string, number>> {
  if (!userIds.length) return new Map();
  const rows = await db
    .select({ userId: events.userId, n: count() })
    .from(events)
    .where(
      and(
        inArray(events.userId, userIds),
        eq(events.type, "product_view"),
        gt(events.occurredAt, new Date(Date.now() - 30 * 86400 * 1000)),
      ),
    )
    .groupBy(events.userId);
  return new Map(rows.map((r) => [r.userId as string, r.n]));
}
