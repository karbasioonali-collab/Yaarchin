// ورود محصول از صفحه‌ی ذخیره‌شده‌ی علی‌بابا، PR دوم (migration ۰۰۱۲). docs/infoyaarchin.md بخش ۳۶ و docs/db/0012-import.md
// فقط جدول‌های تازه؛ به جدول‌های قبلی دست نمی‌زند.
import { sql } from "drizzle-orm";
import { bigserial, check, customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_common";
import { users } from "./auth";
import { companies, productListings, products } from "./catalog";

// ستون باینری Postgres (Buffer در Node)
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

// هر صفحه‌ی واردشده (آپلود MHTML، یا بعداً HTML اکستنشن). خود فایل MHTML نگه داشته نمی‌شود (بیشترش CSS است)؛
// فقط HTML اصلی فشرده (gzip) برای «خواندن دوباره»، فهرست عکس‌های داخل فایل، و نتیجه‌ی خواننده.
//   status: new | reviewed | imported | rejected
export const rawPages = pgTable(
  "raw_pages",
  {
    id: id(),
    // upload | extension
    source: text("source").notNull().default("upload"),
    platform: text("platform").notNull().default("alibaba"),
    url: text("url"),
    // شناسه‌ی محصول و فروشگاه در پلتفرم (برای تشخیص تکراری)
    externalProductId: text("external_product_id"),
    storeId: text("store_id"),
    title: text("title"),
    // sha256 فایل آپلودی؛ همان فایل دو بار وارد نمی‌شود
    sha256: text("sha256").notNull(),
    fileName: text("file_name"),
    fileBytes: integer("file_bytes").notNull().default(0),
    htmlGz: bytea("html_gz").notNull(),
    htmlBytes: integer("html_bytes").notNull().default(0),
    // عکس‌های داخل فایل: { [url]: [type, size] } (برای lookup خواننده موقع «خواندن دوباره»)
    resources: jsonb("resources").notNull().default({}),
    // خروجی parseAlibabaProduct (src/lib/import/alibaba/parse.ts)
    parsed: jsonb("parsed").notNull().default({}),
    parserVersion: integer("parser_version").notNull(),
    status: text("status").notNull().default("new"),
    rejectReason: text("reject_reason"),
    // پیوند به چیزی که از این صفحه ساخته شد (PR سوم)
    listingId: uuid("listing_id").references(() => productListings.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("raw_pages_sha256_uq").on(t.sha256),
    index("raw_pages_status_idx").on(t.status, t.createdAt),
    index("raw_pages_product_idx").on(t.platform, t.externalProductId),
    index("raw_pages_store_idx").on(t.platform, t.storeId),
    check("raw_pages_status_check", sql`${t.status} in ('new', 'reviewed', 'imported', 'rejected')`),
  ],
);

// عکس‌های اصلی هر صفحه (عکس‌های توضیحات فقط لینک‌اند و در parsed می‌مانند).
// راه‌حل موقت تا فضای ابری (S3): بایت‌ها در bytes. بعداً انتقال = آپلود هر ردیف به storage، پر کردن storage_key
// و خالی کردن bytes (docs/infoyaarchin.md بخش ۳۶ «انتقال به S3»). همیشه دقیقاً یکی از این دو پر است.
export const rawPageImages = pgTable(
  "raw_page_images",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    rawPageId: uuid("raw_page_id")
      .notNull()
      .references(() => rawPages.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    position: integer("position").notNull().default(0),
    mime: text("mime").notNull(),
    size: integer("size").notNull().default(0),
    bytes: bytea("bytes"),
    storageKey: text("storage_key"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("raw_page_images_page_url_uq").on(t.rawPageId, t.url), check("raw_page_images_where_check", sql`(${t.bytes} is not null) <> (${t.storageKey} is not null)`)],
);

// شناسه‌ی محصول در پلتفرم ← لیستینگ (مثل company_external_ids برای فروشنده). یکتا: یک لیستینگ علی‌بابا یک بار.
export const listingExternalIds = pgTable(
  "listing_external_ids",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => productListings.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("listing_external_ids_uq").on(t.platform, t.externalId), index("listing_external_ids_listing_idx").on(t.listingId)],
);
