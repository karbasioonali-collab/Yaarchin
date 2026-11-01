// پیش‌نویس متن فارسی محصول با AI (migration ۰۰۱۴؛ PR ۴ب). docs/infoyaarchin.md بخش ۴۰.
// تا انسان در فرم محصول «ذخیره» نزند، هیچ‌چیز در products عوض نمی‌شود؛ این جدول فقط پیش‌نویس و ورودیِ فرستاده‌شده را نگه می‌دارد.
//   status: ready (قابل استفاده) | blocked (محافظ رد کرد؛ دلیل در guard_hits) | error (مدل جواب نداد یا قالب نادرست)
//   input:  همان چیزی که واقعاً به AI رفت (برای بازبینی؛ بدون اطلاعات کارخانه)
//   output: { titleFa, summaryFa, descriptionFa, specs: [{ labelFa, valueFa, unit }] } بعد از یکسان‌سازی متن
import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_common";
import { aiRequests } from "./ai";
import { users } from "./auth";
import { products } from "./catalog";

export const productTextDrafts = pgTable(
  "product_text_drafts",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["ready", "blocked", "error"] }).notNull(),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output"),
    guardHits: jsonb("guard_hits").notNull().default([]),
    aiRequestId: bigint("ai_request_id", { mode: "number" }).references(() => aiRequests.id, { onDelete: "set null" }),
    costToman: numeric("cost_toman", { precision: 14, scale: 2 }).notNull().default("0"),
    model: text("model"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("product_text_drafts_product_idx").on(t.productId, t.createdAt), check("product_text_drafts_status_check", sql`${t.status} in ('ready', 'blocked', 'error')`)],
);
