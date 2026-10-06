// پیگیری کارخانه‌ها برای هر درخواست مشتری و صف پیامک (migration ۰۰۰۷).
// docs/infoyaarchin.md بخش ۲۵ و docs/db/0007-followup-sms.md
import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_common";
import { users } from "./auth";
import { companies, companyCorrespondence, productListings, products } from "./catalog";
import { conversations } from "./chat";

// ---------- درخواست مشتری (از داخل چت) ----------
// محصول از کاتالوگ (product_id) یا برای محصولی که در سایت نیست فقط اسم (product_title). اسم محصول کاتالوگ هم همیشه در
// product_title ذخیره می‌شود (عکس لحظه‌ی ساخت) تا با حذف محصول (product_id ← null) درخواست بی‌نام نماند. status: open | done | cancelled.
export const inquiries = pgTable(
  "inquiries",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "restrict" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    productTitle: text("product_title"),
    qty: integer("qty"),
    note: text("note"),
    status: text("status", { enum: ["open", "done", "cancelled"] })
      .notNull()
      .default("open"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("inquiries_conversation_idx").on(t.conversationId),
    index("inquiries_status_idx").on(t.status, t.createdAt),
    check("inquiries_status_check", sql`${t.status} in ('open', 'done', 'cancelled')`),
    check("inquiries_qty_check", sql`${t.qty} is null or ${t.qty} > 0`),
    check("inquiries_product_check", sql`${t.productId} is not null or ${t.productTitle} is not null`),
  ],
);

// کارخانه‌های یک درخواست با وضعیت فعلی. تاریخچه‌ی کامل در inquiry_supplier_events (فقط افزودنی).
// status: pending (هنوز پیام نداده‌ایم) | contacted (پیام داده شد) | replied (جواب داد) | quoted (قیمت گرفته شد) | declined (رد شد)
export const INQUIRY_SUPPLIER_STATUSES = ["pending", "contacted", "replied", "quoted", "declined"] as const;
export const inquirySuppliers = pgTable(
  "inquiry_suppliers",
  {
    id: id(),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "restrict" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    listingId: uuid("listing_id").references(() => productListings.id, { onDelete: "set null" }),
    status: text("status", { enum: INQUIRY_SUPPLIER_STATUSES }).notNull().default("pending"),
    lastNote: text("last_note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("inquiry_suppliers_uq").on(t.inquiryId, t.companyId),
    index("inquiry_suppliers_company_idx").on(t.companyId),
    check("inquiry_suppliers_status_check", sql`${t.status} in ('pending', 'contacted', 'replied', 'quoted', 'declined')`),
  ],
);

// هر تغییر وضعیت با یادداشت، زمان و ثبت‌کننده؛ و ردیف متناظرش در سابقه‌ی مکاتبه‌ی کارخانه (correspondence_id).
export const inquirySupplierEvents = pgTable(
  "inquiry_supplier_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    inquirySupplierId: uuid("inquiry_supplier_id")
      .notNull()
      .references(() => inquirySuppliers.id, { onDelete: "restrict" }),
    status: text("status", { enum: INQUIRY_SUPPLIER_STATUSES }).notNull(),
    note: text("note"),
    correspondenceId: bigint("correspondence_id", { mode: "number" }).references(() => companyCorrespondence.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("inquiry_supplier_events_supplier_idx").on(t.inquirySupplierId, t.createdAt),
    index("inquiry_supplier_events_by_idx").on(t.createdBy, t.createdAt),
    check("inquiry_supplier_events_status_check", sql`${t.status} in ('pending', 'contacted', 'replied', 'quoted', 'declined')`),
  ],
);

// ---------- صف پیامک ----------
// هر پیامک (واقعی یا آزمایشی) یک ردیف. status:
//   test    ← سرویس پیامک وصل نیست (SMS_PROVIDER خالی)؛ فقط اینجا ثبت شد و در پنل «پیامک‌های ارسالی» دیده می‌شود
//   sent    ← سرویس‌دهنده پذیرفت      failed ← سرویس‌دهنده خطا داد      skipped ← طبق قاعده فرستاده نشد (مثلاً خارج از ساعت کاری)
// متن کد ورود (kind = otp) هرگز ذخیره نمی‌شود؛ پوشانده.
export const smsOutbox = pgTable(
  "sms_outbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    toMobile: text("to_mobile").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: ["test", "sent", "failed", "skipped"] }).notNull(),
    provider: text("provider"),
    error: text("error"),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("sms_outbox_created_idx").on(t.createdAt),
    index("sms_outbox_conversation_idx").on(t.conversationId, t.userId, t.createdAt),
    check("sms_outbox_status_check", sql`${t.status} in ('test', 'sent', 'failed', 'skipped')`),
  ],
);

// تنظیم شخصی هر کارمند: دریافت پیامک هشدار گفتگو (ردیف نبود = روشن)
export const staffNotificationPrefs = pgTable("staff_notification_prefs", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  smsEnabled: boolean("sms_enabled").notNull().default(true),
  updatedAt: updatedAt(),
});
