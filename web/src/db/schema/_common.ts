import { timestamp, uuid } from "drizzle-orm/pg-core";

// ستون‌های مشترک. همه‌ی زمان‌ها timestamptz (UTC در دیتابیس).
export const id = () => uuid("id").primaryKey().defaultRandom();

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
