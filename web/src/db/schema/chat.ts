// چت مشتری با کارشناس (migration ۰۰۰۶). فعلاً بدون AI؛ ساختار برای مرحله‌ی AI آماده است:
//   - فرستنده‌ی «ai» از همین حالا در CHECK پیام‌ها مجاز است؛
//   - conversation_flags برچسب «نیاز به بررسی / نیاز به کارشناس» با دلیل را نگه می‌دارد؛
//   - conversations.attention خلاصه‌ی آخرین برچسب حل‌نشده است (برای فیلتر سریع در فهرست).
// پیام‌ها فقط افزودنی‌اند؛ ارجاع، بستن و بازکردن هم به‌شکل «پیام رویداد» (kind = event) داخل خود چت ثبت می‌شوند.
// docs/infoyaarchin.md بخش ۲۴ و docs/db/0006-chat.md
import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, check, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_common";
import { users } from "./auth";
import { products } from "./catalog";

// kind: product = از صفحه‌ی محصول (یک گفتگو برای هر مشتری × محصول)، general = عمومی از «گفتگوهای من» (subject = موضوع).
export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: ["product", "general"] }).notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    subject: text("subject"),
    status: text("status", { enum: ["open", "closed"] })
      .notNull()
      .default("open"),
    // کارشناس ارجاع‌گرفته؛ null = صف «ارجاع‌نشده». ارجاع همیشه دستی است.
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    lastCustomerMessageAt: timestamp("last_customer_message_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
    // مرحله‌ی AI: آخرین برچسب حل‌نشده (needs_review | needs_expert) و دلیلش؛ تاریخچه در conversation_flags
    attention: text("attention", { enum: ["needs_review", "needs_expert"] }),
    attentionReason: text("attention_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("conversations_queue_idx").on(t.status, t.assignedTo, t.lastMessageAt),
    index("conversations_customer_idx").on(t.customerId, t.lastMessageAt),
    index("conversations_product_idx").on(t.productId),
    // هر مشتری برای هر محصول فقط یک گفتگو (بسته‌شده هم با پیام تازه دوباره باز می‌شود)
    uniqueIndex("conversations_customer_product_uq")
      .on(t.customerId, t.productId)
      .where(sql`${t.kind} = 'product' and ${t.productId} is not null`),
    check("conversations_kind_check", sql`${t.kind} in ('product', 'general')`),
    check("conversations_status_check", sql`${t.status} in ('open', 'closed')`),
    check("conversations_attention_check", sql`${t.attention} is null or ${t.attention} in ('needs_review', 'needs_expert')`),
  ],
);

// sender_type: customer | staff | system | ai.  kind: text (پیام) | event (ارجاع، بستن، بازکردن، …؛ متن آماده‌ی نمایش).
// visible_to_customer = false برای رویدادهای داخلی (مثل ارجاع)؛ مشتری فقط بقیه را می‌بیند.
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "restrict" }),
    senderType: text("sender_type", { enum: ["customer", "staff", "system", "ai"] }).notNull(),
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["text", "event"] })
      .notNull()
      .default("text"),
    body: text("body").notNull(),
    visibleToCustomer: boolean("visible_to_customer").notNull().default(true),
    // جزئیات رویداد (مثلاً {event: "assign", from, to, by}) یا در مرحله‌ی AI مدل و اطمینان پاسخ
    meta: jsonb("meta").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("chat_messages_conversation_idx").on(t.conversationId, t.id),
    check("chat_messages_sender_check", sql`${t.senderType} in ('customer', 'staff', 'system', 'ai')`),
    check("chat_messages_kind_check", sql`${t.kind} in ('text', 'event')`),
    check("chat_messages_body_check", sql`length(${t.body}) between 1 and 4000`),
  ],
);

// آخرین پیامی که هر نفر (مشتری یا کارشناس) در هر گفتگو دیده؛ «خوانده‌نشده» = پیام‌های بعد از آن از طرف مقابل.
export const conversationReads = pgTable(
  "conversation_reads",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadMessageId: bigint("last_read_message_id", { mode: "number" }).notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("conversation_reads_user_idx").on(t.userId)],
);

// مرحله‌ی AI (فقط ساختار): برچسب «نیاز به بررسی / نیاز به کارشناس» با دلیل، روی کل گفتگو یا یک پیام. فقط افزودنی؛
// حل شدن = پر شدن resolved_at/resolved_by.
export const conversationFlags = pgTable(
  "conversation_flags",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "restrict" }),
    messageId: bigint("message_id", { mode: "number" }).references(() => chatMessages.id, { onDelete: "set null" }),
    flag: text("flag", { enum: ["needs_review", "needs_expert"] }).notNull(),
    reason: text("reason"),
    source: text("source", { enum: ["ai", "staff", "system"] }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("conversation_flags_conversation_idx").on(t.conversationId, t.createdAt),
    check("conversation_flags_flag_check", sql`${t.flag} in ('needs_review', 'needs_expert')`),
    check("conversation_flags_source_check", sql`${t.source} in ('ai', 'staff', 'system')`),
  ],
);
