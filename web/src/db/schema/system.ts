// تنظیمات، سوئیچ‌ها، لاگ فعالیت و ثبت رفتار.
import { bigserial, index, inet, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./_common";
import { users } from "./auth";

// هر تنظیم یک کلید و یک مقدار JSON دارد.
// سوئیچ‌های روشن/خاموش: گروه "features" با مقدار true/false (مثل features.payments).
// مدل AI هر وظیفه: گروه "ai" (مثل ai.task.customer_chat = {provider, model, params}).
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  groupKey: text("group_key").notNull(),
  value: jsonb("value").notNull(),
  labelFa: text("label_fa"),
  description: text("description"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// لاگ فعالیت کاربران پنل (چه کسی، چه کاری، روی چه چیزی). فقط افزودنی.
export const activityLog = pgTable(
  "activity_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    // اگر ادمین «به‌جای مشتری» کاری کرده باشد
    actingAsUserId: uuid("acting_as_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // مثل user.create، role.update، auth.login
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_log_created_idx").on(t.createdAt),
    index("activity_log_actor_idx").on(t.actorUserId, t.createdAt),
    index("activity_log_entity_idx").on(t.entityType, t.entityId),
  ],
);

// ثبت رفتار از روز اول: بازدید، کلیک، علاقه‌مندی، پیام، …  فقط افزودنی.
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    type: text("type").notNull(), // page_view | click | favorite | message | inquiry | …
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    // شناسه‌ی ناشناس مرورگر (کوکی) برای بازدیدکننده‌ی واردنشده
    anonId: text("anon_id"),
    entityType: text("entity_type"), // product | category | …
    entityId: text("entity_id"),
    path: text("path"),
    referrer: text("referrer"),
    props: jsonb("props").notNull().default({}),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("events_occurred_idx").on(t.occurredAt),
    index("events_type_idx").on(t.type, t.occurredAt),
    index("events_entity_idx").on(t.entityType, t.entityId),
    index("events_user_idx").on(t.userId, t.occurredAt),
  ],
);
