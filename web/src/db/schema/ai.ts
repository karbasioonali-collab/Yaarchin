// دستیار هوشمند یارچین (AI)، PR اول (migration ۰۰۱۰). docs/infoyaarchin.md بخش ۲۹ و docs/db/0010-ai.md
// ستونی به جدول‌های قبلی (مثل conversations) اضافه نشد: صفحه‌هایی که همه‌ی ستون‌های آن جدول‌ها را می‌خوانند در فاصله‌ی
// استقرار تا migrate خطا می‌دادند. وضعیت AI هر گفتگو در جدول جدای ai_conversation_state است.
import { sql } from "drizzle-orm";
import { bigint, bigserial, check, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_common";
import { users } from "./auth";
import { chatMessages, conversations } from "./chat";

// وضعیت دستیار در هر گفتگو. ردیف نبود = گفتگو قبل از روشن شدن AI ساخته شده (دستیار کاری به آن ندارد).
//   mode = ai     ← دستیار جواب می‌دهد
//   mode = human  ← ساکت (کارشناس یا ادمین پیام داد، ارجاع شد، یا به کارشناس واگذار شد). فقط با «برگرداندن به دستیار»
//                   یا بازشدن دوباره‌ی گفتگوی بسته بعد از ai.resume_after_hours ساعت، دوباره ai می‌شود.
// thinking_since: دستیار در حال نوشتن است (نشانگر «در حال نوشتن…» برای مشتری؛ زمان‌بند گیرکرده‌ها را به کارشناس می‌دهد).
export const aiConversationState = pgTable(
  "ai_conversation_state",
  {
    conversationId: uuid("conversation_id")
      .primaryKey()
      .references(() => conversations.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: ["ai", "human"] })
      .notNull()
      .default("ai"),
    // تعداد جواب‌های دستیار در این گفتگو (سقف ai.max_replies_per_chat)
    replies: integer("replies").notNull().default(0),
    thinkingSince: timestamp("thinking_since", { withTimezone: true }),
    silencedAt: timestamp("silenced_at", { withTimezone: true }),
    silencedReason: text("silenced_reason"),
    silencedBy: uuid("silenced_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_conversation_state_mode_idx").on(t.mode), check("ai_conversation_state_mode_check", sql`${t.mode} in ('ai', 'human')`)],
);

// هر درخواست به مدل (یا تصمیم بدون مدل، مثل ارجاع با قاعده‌ی کد). سقف‌های روزانه و هزینه از همین جدول حساب می‌شوند.
//   purpose: chat | connection_test | test_run | extract | suggest      mode: live (کلید لیارا) | test (حالت آزمایشی)
//   status:  ok | handoff | guard_block | error | timeout | parse_error | skipped
export const aiRequests = pgTable(
  "ai_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    createdAt: createdAt(),
    purpose: text("purpose").notNull(),
    mode: text("mode", { enum: ["live", "test"] }).notNull(),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    // پیام مشتری که این درخواست برایش بود، و پیامی که دستیار نوشت
    messageId: bigint("message_id", { mode: "number" }).references(() => chatMessages.id, { onDelete: "set null" }),
    replyMessageId: bigint("reply_message_id", { mode: "number" }).references(() => chatMessages.id, { onDelete: "set null" }),
    model: text("model"),
    fallbackUsed: integer("fallback_used").notNull().default(0),
    status: text("status").notNull(),
    // منبع جواب (product | calculator | knowledge | general) یا دلیل ارجاع
    outcome: text("outcome"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costToman: numeric("cost_toman", { precision: 14, scale: 2 }).notNull().default("0"),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    meta: jsonb("meta").notNull().default({}),
  },
  (t) => [
    index("ai_requests_created_idx").on(t.createdAt),
    index("ai_requests_conversation_idx").on(t.conversationId, t.createdAt),
    check("ai_requests_mode_check", sql`${t.mode} in ('live', 'test')`),
    check("ai_requests_tokens_check", sql`${t.promptTokens} >= 0 and ${t.completionTokens} >= 0 and ${t.costToman} >= 0`),
  ],
);

// 👍/👎 مشتری زیر هر جواب دستیار، و «جواب اشتباه» کارشناس/ادمین. هر نفر برای هر پیام یک ردیف (آخرین نظرش).
export const aiFeedback = pgTable(
  "ai_feedback",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    messageId: bigint("message_id", { mode: "number" })
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["customer", "staff"] }).notNull(),
    value: text("value", { enum: ["up", "down", "wrong"] }).notNull(),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("ai_feedback_uq").on(t.messageId, t.userId, t.source),
    index("ai_feedback_created_idx").on(t.createdAt),
    check("ai_feedback_source_check", sql`${t.source} in ('customer', 'staff')`),
    check("ai_feedback_value_check", sql`${t.value} in ('up', 'down', 'wrong')`),
  ],
);

// پایگاه دانش: تنها منبع جواب‌های «سیاست و روند» یارچین (پرداخت، نمونه، لوگو، …). فقط status = active به دستیار داده می‌شود.
// همیشه با تأیید انسان؛ دستیار هرگز چیزی اضافه نمی‌کند. هر تغییر متن یک نسخه در kb_item_versions.
// last_reviewed_at جدا از updated_at است: «بررسی شد، درست است» بدون تغییر متن فقط همین را به‌روز می‌کند.
export const kbItems = pgTable(
  "kb_items",
  {
    id: id(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    // شکل‌های دیگر پرسیدن همین سؤال
    variants: jsonb("variants").$type<string[]>().notNull().default([]),
    category: text("category"),
    status: text("status", { enum: ["active", "draft"] })
      .notNull()
      .default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    lastReviewedBy: uuid("last_reviewed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("kb_items_status_idx").on(t.status, t.lastReviewedAt), check("kb_items_status_check", sql`${t.status} in ('active', 'draft')`)],
);

export const kbItemVersions = pgTable(
  "kb_item_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => kbItems.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    variants: jsonb("variants").$type<string[]>().notNull().default([]),
    category: text("category"),
    status: text("status").notNull(),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("kb_item_versions_item_idx").on(t.itemId, t.createdAt)],
);
