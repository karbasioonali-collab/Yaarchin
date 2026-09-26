// دسته‌بندی، شرکت (کارخانه)، محصول ترکیبی، لیستینگ هر شرکت، عکس/ویدیو و قیمت‌های مشاهده‌شده.
// اسم و آدرس شرکت‌ها فقط در companies است و هیچ‌وقت در API یا صفحه‌ی عمومی خوانده نمی‌شود (src/lib/catalog/public.ts).
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
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
    // یادداشت داخلی کارشناس‌ها (migration ۰۰۰۴). مثل همه‌ی اطلاعات کارخانه، فقط در پنل.
    notes: text("notes"),
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
    // HS code پیشنهادی؛ تأیید با انسان (مرحله‌ی ۶). فعلاً متن؛ در مرحله‌ی نرخ‌ها به جدول HS وصل می‌شود.
    hsCode: text("hs_code"),
    // وزن و بسته‌بندی برای ماشین‌حساب هزینه‌ی حمل (migration ۰۰۰۴). همه اختیاری؛ اگر پر باشند > ۰.
    unitWeightKg: numeric("unit_weight_kg", { precision: 10, scale: 3 }),
    cartonLengthCm: numeric("carton_length_cm", { precision: 8, scale: 1 }),
    cartonWidthCm: numeric("carton_width_cm", { precision: 8, scale: 1 }),
    cartonHeightCm: numeric("carton_height_cm", { precision: 8, scale: 1 }),
    cartonWeightKg: numeric("carton_weight_kg", { precision: 10, scale: 3 }),
    unitsPerCarton: integer("units_per_carton"),
    status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
    // امتیاز «جذاب برای واردات» (migration ۰۰۰۲). فقط ۱، ۲، ۳، ۴، ۴٫۵ یا ۵؛ خالی = بدون امتیاز.
    // مقدار مجاز را خود دیتابیس هم کنترل می‌کند (products_import_score_check). فهرست در کد: src/lib/catalog/import-score.ts
    importScore: numeric("import_score", { precision: 2, scale: 1 }),
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
    check("products_import_score_check", sql`${t.importScore} in (1, 2, 3, 4, 4.5, 5)`),
    check(
      "products_packing_check",
      sql`(${t.unitWeightKg} is null or ${t.unitWeightKg} > 0) and (${t.cartonLengthCm} is null or ${t.cartonLengthCm} > 0)
        and (${t.cartonWidthCm} is null or ${t.cartonWidthCm} > 0) and (${t.cartonHeightCm} is null or ${t.cartonHeightCm} > 0)
        and (${t.cartonWeightKg} is null or ${t.cartonWeightKg} > 0) and (${t.unitsPerCarton} is null or ${t.unitsPerCarton} > 0)`,
    ),
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
  (t) => [
    index("price_observations_listing_idx").on(t.listingId, t.observedAt),
    // ارز اصلی: فقط دلار یا یوان (migration ۰۰۰۴). تبدیل به تومان هرگز ذخیره نمی‌شود؛ هر بار با آخرین نرخ حساب می‌شود.
    check("price_observations_currency_check", sql`${t.currency} in ('USD', 'CNY')`),
  ],
);

// زمان آماده‌سازی هر لیستینگ با پله‌ی تعداد (migration ۰۰۰۴). مثل قیمت فقط افزودنی: نوبت تازه = ردیف‌های تازه.
// مثال یک نوبت: (1..500 → 15 روز) و (501..∞ → 30 روز). ستون قدیمی product_listings.lead_time_days
// فقط وقتی استفاده می‌شود که هنوز هیچ پله‌ای برای آن لیستینگ ثبت نشده (داده‌ی demo و قبلی).
export const leadTimeObservations = pgTable(
  "lead_time_observations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => productListings.id, { onDelete: "restrict" }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    minQty: integer("min_qty"),
    maxQty: integer("max_qty"),
    days: integer("days").notNull(),
    source: source(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("lead_time_observations_listing_idx").on(t.listingId, t.observedAt),
    check("lead_time_observations_days_check", sql`${t.days} > 0 and ${t.days} <= 730`),
  ],
);

// ---------- تماس‌ها و سابقه‌ی مکاتبه با کارخانه (migration ۰۰۰۴) — محرمانه، فقط پنل ----------
export const companyContacts = pgTable(
  "company_contacts",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"), // مثلاً Sales Manager
    phone: text("phone"),
    email: text("email"),
    wechat: text("wechat"),
    whatsapp: text("whatsapp"),
    note: text("note"),
    source: source(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("company_contacts_company_idx").on(t.companyId)],
);

// سابقه‌ی مکاتبه: فقط افزودنی (ویرایش و حذف ندارد؛ اصلاح = یادداشت تازه).
// اکستنشن بعداً همین‌جا با source = 'extension' و external_ref (شناسه‌ی پیام/گفتگو در علی‌بابا) ثبت می‌کند؛
// ایندکس یکتای (company_id، source، external_ref) جلوی ثبت دوباره‌ی یک پیام را می‌گیرد.
export const CORRESPONDENCE_KINDS = ["note", "chat_summary", "chat_message", "email", "call"] as const;
export const CORRESPONDENCE_CHANNELS = ["alibaba_chat", "email", "wechat", "whatsapp", "phone", "other"] as const;
export const CORRESPONDENCE_DIRECTIONS = ["inbound", "outbound", "internal"] as const;

export const companyCorrespondence = pgTable(
  "company_correspondence",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    contactId: uuid("contact_id").references(() => companyContacts.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    listingId: uuid("listing_id").references(() => productListings.id, { onDelete: "set null" }),
    kind: text("kind", { enum: CORRESPONDENCE_KINDS }).notNull().default("note"),
    channel: text("channel", { enum: CORRESPONDENCE_CHANNELS }).notNull().default("other"),
    // inbound: از کارخانه، outbound: به کارخانه، internal: یادداشت داخلی
    direction: text("direction", { enum: CORRESPONDENCE_DIRECTIONS }).notNull().default("internal"),
    body: text("body").notNull(),
    // زمان خود مکاتبه (ممکن است قبل از زمان ثبت باشد)
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    source: source(),
    externalRef: text("external_ref"),
    meta: jsonb("meta").notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("company_correspondence_company_idx").on(t.companyId, t.occurredAt),
    index("company_correspondence_product_idx").on(t.productId),
    uniqueIndex("company_correspondence_ref_uq").on(t.companyId, t.source, t.externalRef).where(sql`${t.externalRef} is not null`),
    check("company_correspondence_kind_check", sql`${t.kind} in ('note', 'chat_summary', 'chat_message', 'email', 'call')`),
    check("company_correspondence_channel_check", sql`${t.channel} in ('alibaba_chat', 'email', 'wechat', 'whatsapp', 'phone', 'other')`),
    check("company_correspondence_direction_check", sql`${t.direction} in ('inbound', 'outbound', 'internal')`),
  ],
);
