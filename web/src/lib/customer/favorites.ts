import "server-only";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { favorites } from "@/db/schema";
import { customerReady } from "@/lib/db-ready";
import { trackEvent } from "./events";

// علاقه‌مندی‌های مشتری. تا migration ۰۰۰۳ اجرا نشده، همه‌ی توابع بی‌اثرند (خطا نمی‌دهند).

export async function isFavorite(userId: string, productId: string): Promise<boolean> {
  if (!(await customerReady())) return false;
  const [r] = await db
    .select({ n: count() })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)));
  return r.n > 0;
}

// افزودن/حذف (تکرار بی‌اثر است و رفتار فقط وقتی واقعاً تغییری رخ داد ثبت می‌شود)
export async function setFavorite(userId: string, productId: string, on: boolean, path: string | null): Promise<boolean> {
  if (!(await customerReady())) return false;
  const changed = on
    ? (await db.insert(favorites).values({ userId, productId }).onConflictDoNothing().returning({ id: favorites.productId })).length > 0
    : (await db
        .delete(favorites)
        .where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)))
        .returning({ id: favorites.productId })).length > 0;
  if (changed) {
    await trackEvent({ userId, type: on ? "favorite_add" : "favorite_remove", entityType: "product", entityId: productId, path });
  }
  return changed;
}

// شناسه‌ی محصولات علاقه‌مندی (جدیدترین اول)
export async function favoriteProductIds(userId: string): Promise<string[]> {
  if (!(await customerReady())) return [];
  const rows = await db
    .select({ id: favorites.productId })
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt));
  return rows.map((r) => r.id);
}

export async function favoriteCounts(userIds: string[]): Promise<Map<string, number>> {
  if (!userIds.length || !(await customerReady())) return new Map();
  const rows = await db
    .select({ userId: favorites.userId, n: count() })
    .from(favorites)
    .where(inArray(favorites.userId, userIds))
    .groupBy(favorites.userId);
  return new Map(rows.map((r) => [r.userId, r.n]));
}
