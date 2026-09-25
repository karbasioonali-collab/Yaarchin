import "server-only";
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";
import { db } from "@/db/client";
import { siteBlocks } from "@/db/schema";
import { catalogReady } from "@/lib/db-ready";
import { type BlockKey, type BlockMap, normalize } from "./blocks";

export type Block<K extends BlockKey> = { data: BlockMap[K]; isVisible: boolean; updatedAt: Date | null };

// همه‌ی بلوک‌ها یک‌بار در هر درخواست خوانده می‌شوند.
const allBlocks = cache(async () => {
  // صفحه‌های سایت در زمان build ساخته نمی‌شوند (دیتابیس آن موقع در دسترس نیست و محتوا باید تازه باشد)
  await connection();
  if (!(await catalogReady())) return [];
  return db.select().from(siteBlocks);
});

export async function getBlock<K extends BlockKey>(key: K): Promise<Block<K>> {
  const row = (await allBlocks()).find((r) => r.key === key);
  return { data: normalize[key](row?.data), isVisible: row?.isVisible ?? true, updatedAt: row?.updatedAt ?? null };
}

export async function saveBlock<K extends BlockKey>(
  key: K,
  data: BlockMap[K],
  isVisible: boolean,
  userId: string,
): Promise<{ before: unknown }> {
  const [existing] = await db.select().from(siteBlocks).where(eq(siteBlocks.key, key));
  await db
    .insert(siteBlocks)
    .values({ key, data, isVisible, updatedBy: userId })
    .onConflictDoUpdate({ target: siteBlocks.key, set: { data, isVisible, updatedBy: userId, updatedAt: new Date() } });
  return { before: existing ? { data: existing.data, isVisible: existing.isVisible } : null };
}

// برگرداندن بلوک به مقدار پیش‌فرض (ردیف حذف می‌شود؛ مقدار قبلی در لاگ فعالیت می‌ماند)
export async function resetBlock(key: BlockKey): Promise<{ before: unknown }> {
  const [existing] = await db.delete(siteBlocks).where(eq(siteBlocks.key, key)).returning();
  return { before: existing ? { data: existing.data, isVisible: existing.isVisible } : null };
}
