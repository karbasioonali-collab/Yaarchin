// امتیاز جدیت مشتری (lead scoring) با قانون‌های قابل تنظیم از پنل، و جای «نشانه»هایی که AI بعداً می‌نویسد (migration ۰۰۰۹).
// docs/infoyaarchin.md بخش ۲۸ و docs/db/0009-reports-leads.md
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, numeric, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_common";
import { users } from "./auth";

// نوع هر قانون = منبع داده‌اش (src/lib/leads/score.ts). نوع تازه = یک مقدار تازه در کد؛ جدول تغییر نمی‌کند
// (عمداً CHECK روی kind نیست تا نوع تازه migration نخواهد؛ کد نوع ناشناخته را نادیده می‌گیرد).
//   favorites        تعداد علاقه‌مندی‌های فعلی
//   visit_days       تعداد روزهای بازدید از سایت (روز تهران)
//   product_views    تعداد محصول متفاوتِ دیده‌شده
//   profile_complete پروفایل کسب‌وکار کامل (نوع کار، شهر، سابقه‌ی واردات) = ۱ واحد
//   chats            تعداد گفتگو
//   inquiries        تعداد «درخواست مشتری» ساخته‌شده از گفتگوهایش
//   signal           مقدار عددی customer_signals با کلید params.signal (مثلاً orders_count که AI می‌نویسد)
export const LEAD_RULE_KINDS = ["favorites", "visit_days", "product_views", "profile_complete", "chats", "inquiries", "signal"] as const;

export const leadScoreRules = pgTable(
  "lead_score_rules",
  {
    id: id(),
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    labelFa: text("label_fa").notNull(),
    // امتیاز هر واحد و سقف امتیاز این قانون (null = بدون سقف)
    points: numeric("points", { precision: 8, scale: 2 }).notNull(),
    cap: numeric("cap", { precision: 8, scale: 2 }),
    // فقط رفتار N روز اخیر (null = همه‌ی زمان‌ها)
    windowDays: integer("window_days"),
    enabled: boolean("enabled").notNull().default(true),
    // تنظیم‌های خاص نوع (مثلاً { signal: "orders_count" })
    params: jsonb("params").notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    // system = پیش‌فرض‌های seed | admin = ساخته در پنل | ai = پیشنهاد/ساخت بسته‌ی AI
    source: text("source", { enum: ["system", "admin", "ai"] })
      .notNull()
      .default("admin"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("lead_score_rules_key_uq").on(t.key),
    check("lead_score_rules_source_check", sql`${t.source} in ('system', 'admin', 'ai')`),
    check("lead_score_rules_points_check", sql`${t.points} >= 0 and (${t.cap} is null or ${t.cap} >= 0)`),
    check("lead_score_rules_window_check", sql`${t.windowDays} is null or ${t.windowDays} between 1 and 3650`),
  ],
);

// «نشانه»های هر مشتری که از بیرونِ رفتار سایت می‌آیند (فعلاً خالی). بسته‌ی AI مثلاً «تعداد سفارش» یا «سرمایه‌ی تخمینی از چت»
// را اینجا می‌نویسد و ادمین در پنل یک قانون از نوع signal رویش می‌سازد؛ بدون تغییر کد امتیازدهی.
export const customerSignals = pgTable(
  "customer_signals",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueNum: numeric("value_num", { precision: 14, scale: 2 }),
    valueText: text("value_text"),
    // ai | manual | …
    source: text("source").notNull().default("ai"),
    // اطمینان AI (۰ تا ۱)، اختیاری
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    note: text("note"),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.key] }),
    index("customer_signals_key_idx").on(t.key),
    check("customer_signals_confidence_check", sql`${t.confidence} is null or ${t.confidence} between 0 and 1`),
  ],
);
