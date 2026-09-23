import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import seed from "@/db/seed-data.json";

type SettingRow = typeof settings.$inferSelect;

// مقدار پیش‌فرض هر تنظیم از seed-data.json؛ اگر ردیفش در دیتابیس نباشد همین برمی‌گردد.
const DEFAULTS = new Map<string, unknown>(seed.settings.map((s) => [s.key, s.value]));

export const getAllSettings = cache(async (): Promise<SettingRow[]> => {
  return db.select().from(settings).orderBy(settings.groupKey, settings.key);
});

export async function getSetting<T = unknown>(key: string): Promise<T> {
  const row = (await getAllSettings()).find((s) => s.key === key);
  return (row ? row.value : DEFAULTS.get(key)) as T;
}

// سوئیچ روشن/خاموش یک بخش (features.*)
export async function isEnabled(feature: string): Promise<boolean> {
  return (await getSetting<boolean>(`features.${feature}`)) === true;
}

export async function setSetting(key: string, value: unknown, userId: string): Promise<{ before: unknown }> {
  const [existing] = await db.select().from(settings).where(eq(settings.key, key));
  if (!existing) throw new Error(`unknown setting: ${key}`);
  await db.update(settings).set({ value, updatedBy: userId }).where(eq(settings.key, key));
  return { before: existing.value };
}
