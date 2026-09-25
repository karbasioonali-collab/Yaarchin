// محتوای ویرایش‌پذیر سایت عمومی و پیام‌های «تماس با ما».
import { boolean, index, inet, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_common";
import { users } from "./auth";

// هر بلوک یک کلید و یک JSON دارد: header، footer، home.slider، page.about، page.contact.
// ساختار data هر کلید در src/lib/site/blocks.ts تعریف و اعتبارسنجی می‌شود؛ بخش جدید = کلید جدید، بدون migration.
export const siteBlocks = pgTable("site_blocks", {
  key: text("key").primaryKey(),
  data: jsonb("data").notNull().default({}),
  // مخفی کردن کل بلوک (هر زیربخش هم داخل data پرچم visible خودش را دارد)
  isVisible: boolean("is_visible").notNull().default(true),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// پیام‌های فرم «تماس با ما».
export const contactMessages = pgTable(
  "contact_messages",
  {
    id: id(),
    // اگر فرستنده وارد شده باشد (از مرحله‌ی ۵)
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    mobile: text("mobile"),
    email: text("email"),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    status: text("status", { enum: ["new", "read", "archived"] }).notNull().default("new"),
    handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    // برای محدود کردن ارسال پشت‌سرهم (اسپم)
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("contact_messages_status_idx").on(t.status, t.createdAt),
    index("contact_messages_ip_idx").on(t.ip, t.createdAt),
  ],
);
