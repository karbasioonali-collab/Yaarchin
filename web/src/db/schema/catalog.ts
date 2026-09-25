// دسته‌بندی، شرکت (کارخانه)، محصول ترکیبی، لیستینگ هر شرکت، عکس/ویدیو و قیمت‌های مشاهده‌شده.
// اسم و آدرس شرکت‌ها فقط در companies است و هیچ‌وقت در API یا صفحه‌ی عمومی خوانده نمی‌شود (src/lib/catalog/public.ts).
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_common";
import { users } from "./auth";

// منبع هر ردیف: manual (پنل)، extension (اکستنشن/ایمپورت)، demo (داده‌ی آزمایشی؛ با یک دستور پاک می‌شود).
const source = () => text("source").notNull().default("manual");

// ---------- دسته‌بندی (درختی، عمق نامحدود) ----------
export const categories = pgTable(
  "categories",
  {
    id: id(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "restrict" }),
    // برای آدرس صفحه (/c/<slug>). لاتین، یکتا.
    slug: text("slug").notNull().unique(),
    nameFa: text("name_fa").notNull(),
    nameEn: text("name_en"),
    descriptionFa: text("description_fa"),
    // کلید فایل در storage (نه آدرس کامل)
    image: text("image"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status", { enum: ["active", "hidden"] }).notNull().default("active"),
    meta: jsonb("meta").notNull().default({}),
    source: source(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("categories_parent_idx").on(t.parentId, t.sortOrder)],
);

// ---------- شرکت (کارخانه/تأمین‌کننده) — محرمانه ----------
export const companies = pgTable(
  "companies",
  {
    id: id(),
    companyType: text("company_type", { enum: ["manufacturer", "trading", "unknown"] })
      .notNull()
      .default("unknown"),
    nameEn: text("name_en").notNull(),
    nameFa: text("name_fa"),
    country: text("country").notNull().default("CN"),
    province: text("province"),
    city: text("city"),
    address: text("address"),
    website: text("website"),
    // فاز ۲: کاربرِ خود شرکت
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status", { enum: ["active", "blocked", "merged"] }).notNull().default("active"),
    // اگر دو ردیف یک شرکت بودند، این به ردیف اصلی اشاره می‌کند (ادغام بدون حذف)
    mergedIntoId: uuid("merged_into_id").references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
    meta: jsonb("meta").notNull().default({}),
    source: source(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("companies_status_idx").on(t.status)],
);

// شناسه‌ی شرکت در پلتفرم‌ها (مثل شناسه‌ی فروشنده در علی‌بابا) برای تشخیص تکراری.
export const companyExternalIds = pgTable(
  "company_external_ids",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // alibaba | made_in_china | …
    externalId: text("external_id").notNull(),
    url: text("url"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("company_external_ids_uq").on(t.platform, t.externalId),
    index("company_external_ids_company_idx").on(t.companyId),
  ],
);

export const companyCategories = pgTable(
  "company_categories",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.categoryId] }), index("company_categories_category_idx").on(t.categoryId)],
);

// ---------- محصول (صفحه‌ی ترکیبی) ----------
export const products = pgTable(
  "products",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    // combined: ترکیب چند کارخانه (بدون اسمشان) | direct: محصول یک شرکت (فاز ۲)
    kind: text("kind", { enum: ["combined", "direct"] }).notNull().default("combined"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    titleFa: text("title_fa").notNull(),
    titleEn: text("title_en"),
    summaryFa: text("summary_fa"),
    descriptionFa: text("description_fa"),
    // مشخصات مشترک: [{ labelFa, labelEn?, valueFa, valueEn?, unit? }]
    specs: jsonb("specs").notNull().default([]),
    // واحد قیمت (piece، set، kg، …) برای «قیمت هر …»
    priceUnit: text("price_unit").notNull().default("piece"),
    // HS code پیشنهادی؛ تأیید با انسان (مرحله‌ی ۶)
    hsCode: text("hs_code"),
    status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    meta: jsonb("meta").notNull().default({}),
    source: source(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("products_category_idx").on(t.categoryId, t.status),
    index("products_status_idx").on(t.status, t.publishedAt),
  ],
);

// لیستینگ هر شرکت برای یک محصول (یک صفحه‌ی علی‌بابا). ممکن است هنوز به محصولی وصل نشده باشد.
export const productListings = pgTable(
  "product_listings",
  {
    id: id(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    externalUrl: text("external_url"),
    titleEn: text("title_en"),
    moq: integer("moq"),
    moqUnit: text("moq_unit"),
    leadTimeDays: integer("lead_time_days"),
    // مشخصات همین لیستینگ (خام/استخراج‌شده)
    specs: jsonb("specs").notNull().default({}),
    status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
    meta: jsonb("meta").notNull().default({}),
    source: source(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("product_listings_product_idx").on(t.productId, t.status),
    index("product_listings_company_idx").on(t.companyId),
  ],
);

// عکس و ویدیوی محصول. storage_key مسیر فایل در لایه‌ی storage است (نه آدرس کامل).
export const productMedia = pgTable(
  "product_media",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // از لیستینگ کدام شرکت آمده (داخلی؛ در API عمومی نمی‌آید)
    listingId: uuid("listing_id").references(() => productListings.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["image", "video"] }).notNull().default("image"),
    storageKey: text("storage_key").notNull(),
    // عکس پیش‌نمایش ویدیو
    posterKey: text("poster_key"),
    width: integer("width"),
    height: integer("height"),
    altFa: text("alt_fa"),
    sortOrder: integer("sort_order").notNull().default(0),
    // عکسی که لوگو/اسم کارخانه دارد نباید عمومی شود
    isPublic: boolean("is_public").notNull().default(true),
    source: source(),
    createdAt: createdAt(),
  },
  (t) => [index("product_media_product_idx").on(t.productId, t.sortOrder)],
);

// قیمت‌های مشاهده‌شده. فقط افزودنی: هیچ‌وقت ویرایش یا بازنویسی نمی‌شود؛ قیمت جدید = ردیف جدید.
export const priceObservations = pgTable(
  "price_observations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => productListings.id, { onDelete: "restrict" }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    currency: text("currency").notNull().default("USD"),
    unit: text("unit").notNull().default("piece"),
    // پله‌ی تعداد (مثلاً 100 تا 499)
    minQty: integer("min_qty"),
    maxQty: integer("max_qty"),
    // قیمت واحد؛ اگر بازه نیست price_max خالی است
    priceMin: numeric("price_min", { precision: 14, scale: 4 }).notNull(),
    priceMax: numeric("price_max", { precision: 14, scale: 4 }),
    source: source(),
    // مرحله‌ی ۳: ارجاع به صفحه‌ی خام (raw_pages) که قیمت از آن استخراج شد
    rawPageId: uuid("raw_page_id"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("price_observations_listing_idx").on(t.listingId, t.observedAt)],
);
