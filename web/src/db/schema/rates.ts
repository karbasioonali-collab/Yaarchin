// نرخ‌ها و هزینه‌ها (migration ۰۰۰۵): ارز و نرخ روزانه، روش‌های حمل، بیمه و هزینه‌های دیگر، HS code و حقوق ورودی، مالیات.
// قاعده‌ی مشترک: همه‌ی جدول‌های «…_versions» و exchange_rates فقط افزودنی‌اند؛ تغییر = ردیف تازه، و ردیف‌های قبلی
// به‌عنوان تاریخچه می‌مانند. «مقدار فعلی» = جدیدترین نسخه‌ای که valid_from آن رسیده (برای نرخ ارز: بیشترین rate_date).
// هیچ عدد تومانی از محاسبه ذخیره نمی‌شود؛ ماشین‌حساب (src/lib/pricing) هر بار از همین جدول‌ها حساب می‌کند.
// docs/infoyaarchin.md بخش ۲۱ و docs/db/0005-rates.md
import { sql } from "drizzle-orm";
import { bigserial, boolean, check, date, index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_common";
import { users } from "./auth";

// منبع هر ردیف: manual (پنل)، import (فایل HS)، demo (داده‌ی آزمایشی؛ seed-demo --remove پاکش می‌کند)
const source = () => text("source").notNull().default("manual");
const createdBy = () => uuid("created_by").references(() => users.id, { onDelete: "set null" });
const validFrom = () => timestamp("valid_from", { withTimezone: true }).notNull().defaultNow();

// ---------- ارز ----------
// کد سه‌حرفی (USD، CNY، EUR، …). IRT = تومان: ارز پایه، نرخش همیشه ۱ و نرخ روزانه ندارد (is_base).
export const currencies = pgTable(
  "currencies",
  {
    code: text("code").primaryKey(),
    nameFa: text("name_fa").notNull(),
    isBase: boolean("is_base").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [check("currencies_code_check", sql`${t.code} ~ '^[A-Z]{3}$'`)],
);

// نرخ هر ارز به تومان. kind: market (بازار؛ برای کالا، حمل و هزینه‌ها) یا customs (نرخ گمرکی؛ برای حقوق ورودی و/یا
// ارزش افزوده، طبق tax_versions.customs_rate_for). rate_date = روزی که نرخ مال آن است (تقویم تهران).
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currencies.code, { onDelete: "restrict" }),
    kind: text("kind", { enum: ["market", "customs"] })
      .notNull()
      .default("market"),
    rateToman: numeric("rate_toman", { precision: 18, scale: 4 }).notNull(),
    rateDate: date("rate_date").notNull(),
    note: text("note"),
    source: source(),
    createdBy: createdBy(),
    createdAt: createdAt(),
  },
  (t) => [
    index("exchange_rates_currency_idx").on(t.currencyCode, t.kind, t.rateDate, t.createdAt),
    check("exchange_rates_kind_check", sql`${t.kind} in ('market', 'customs')`),
    check("exchange_rates_rate_check", sql`${t.rateToman} > 0`),
  ],
);

// ---------- روش‌های حمل ----------
// چهار روش ثابت (از seed). مقدارها در shipping_method_versions.
export const shippingMethods = pgTable(
  "shipping_methods",
  {
    key: text("key").primaryKey(),
    nameFa: text("name_fa").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [check("shipping_methods_key_check", sql`${t.key} in ('air', 'sea', 'land', 'rail')`)],
);

// هزینه‌ی حمل = max(حداقل هزینه، وزن قابل‌محاسبه × نرخ هر کیلو + حجم × نرخ هر متر مکعب)
// وزن قابل‌محاسبه = بیشترِ (وزن واقعی) و (حجم × ضریب وزن حجمی). ضریب = چند کیلو به ازای هر متر مکعب (مثلاً هوایی ۱۶۷).
export const shippingMethodVersions = pgTable(
  "shipping_method_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    methodKey: text("method_key")
      .notNull()
      .references(() => shippingMethods.key, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    ratePerKg: numeric("rate_per_kg", { precision: 18, scale: 4 }),
    ratePerCbm: numeric("rate_per_cbm", { precision: 18, scale: 4 }),
    volumetricFactor: numeric("volumetric_factor", { precision: 10, scale: 2 }),
    minCharge: numeric("min_charge", { precision: 18, scale: 4 }),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currencies.code, { onDelete: "restrict" }),
    transitMinDays: integer("transit_min_days"),
    transitMaxDays: integer("transit_max_days"),
    validFrom: validFrom(),
    note: text("note"),
    source: source(),
    createdBy: createdBy(),
    createdAt: createdAt(),
  },
  (t) => [
    index("shipping_method_versions_method_idx").on(t.methodKey, t.validFrom),
    check(
      "shipping_method_versions_values_check",
      sql`(${t.ratePerKg} is null or ${t.ratePerKg} >= 0) and (${t.ratePerCbm} is null or ${t.ratePerCbm} >= 0)
        and (${t.volumetricFactor} is null or ${t.volumetricFactor} > 0) and (${t.minCharge} is null or ${t.minCharge} >= 0)
        and (${t.transitMinDays} is null or ${t.transitMinDays} between 1 and 365)
        and (${t.transitMaxDays} is null or ${t.transitMaxDays} between 1 and 365)
        and (${t.transitMinDays} is null or ${t.transitMaxDays} is null or ${t.transitMinDays} <= ${t.transitMaxDays})`,
    ),
  ],
);

// ---------- بیمه و هزینه‌های دیگر ----------
// هر آیتم (مثل «بیمه»، «ترخیص»، «حمل داخلی») یک ردیف؛ اسم را ادمین می‌دهد. مقدار و روش محاسبه در نسخه‌ها.
export const costItems = pgTable("cost_items", {
  id: id(),
  nameFa: text("name_fa").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  source: source(),
  createdBy: createdBy(),
  createdAt: createdAt(),
});

// calc_type:
//   fixed    ← amount برای کل سفارش (به ارز currency_code)
//   percent  ← amount درصد از جمع پایه‌های percent_base (goods = ارزش کالا، shipping = هزینه‌ی حمل)
//   per_kg   ← amount × وزن واقعی (کیلو)       per_cbm ← amount × حجم (متر مکعب)
//   formula  ← متن فرمول با متغیرهای آماده (src/lib/pricing/formula.ts)؛ هرگز به‌شکل کد اجرا نمی‌شود
// methods: روش‌های حملی که آیتم برایشان حساب می‌شود؛ null = همه.
export const costItemVersions = pgTable(
  "cost_item_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => costItems.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    calcType: text("calc_type", { enum: ["fixed", "percent", "per_kg", "per_cbm", "formula"] }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 4 }),
    percentBase: text("percent_base").array(),
    formula: text("formula"),
    currencyCode: text("currency_code").references(() => currencies.code, { onDelete: "restrict" }),
    methods: text("methods").array(),
    validFrom: validFrom(),
    note: text("note"),
    source: source(),
    createdBy: createdBy(),
    createdAt: createdAt(),
  },
  (t) => [
    index("cost_item_versions_item_idx").on(t.itemId, t.validFrom),
    check("cost_item_versions_type_check", sql`${t.calcType} in ('fixed', 'percent', 'per_kg', 'per_cbm', 'formula')`),
    check("cost_item_versions_amount_check", sql`${t.amount} is null or ${t.amount} >= 0`),
    check("cost_item_versions_base_check", sql`${t.percentBase} is null or ${t.percentBase} <@ array['goods', 'shipping']::text[]`),
    check("cost_item_versions_methods_check", sql`${t.methods} is null or ${t.methods} <@ array['air', 'sea', 'land', 'rail']::text[]`),
  ],
);

// ---------- HS code و حقوق ورودی ----------
// code فقط رقم (۴ تا ۱۲ رقم، مثل 85094000). فیلد متنی products.hs_code با همین رقم‌ها (بدون نقطه و فاصله) به لیست وصل می‌شود.
export const hsCodes = pgTable(
  "hs_codes",
  {
    code: text("code").primaryKey(),
    source: source(),
    createdAt: createdAt(),
  },
  (t) => [check("hs_codes_code_check", sql`${t.code} ~ '^[0-9]{4,12}$'`)],
);

// duty_type: percent ← duty_value درصد از جمع پایه‌های duty_base (goods، shipping، costs = بیمه و هزینه‌های دیگر)
//            fixed   ← duty_value به ارز duty_currency به ازای fixed_per (unit = هر عدد، kg = هر کیلو، shipment = کل محموله)
// is_active = false یعنی کد از لیست برداشته شده (محصولش «استعلام» می‌شود). import_batch = شناسه‌ی یک نوبت ورود فایل.
export const hsCodeVersions = pgTable(
  "hs_code_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code")
      .notNull()
      .references(() => hsCodes.code, { onDelete: "restrict" }),
    titleFa: text("title_fa"),
    isActive: boolean("is_active").notNull().default(true),
    dutyType: text("duty_type", { enum: ["percent", "fixed"] }).notNull(),
    dutyValue: numeric("duty_value", { precision: 18, scale: 4 }).notNull(),
    dutyBase: text("duty_base").array(),
    dutyCurrency: text("duty_currency").references(() => currencies.code, { onDelete: "restrict" }),
    fixedPer: text("fixed_per", { enum: ["unit", "kg", "shipment"] }),
    validFrom: validFrom(),
    importBatch: uuid("import_batch"),
    note: text("note"),
    source: source(),
    createdBy: createdBy(),
    createdAt: createdAt(),
  },
  (t) => [
    index("hs_code_versions_code_idx").on(t.code, t.validFrom),
    check("hs_code_versions_type_check", sql`${t.dutyType} in ('percent', 'fixed')`),
    check("hs_code_versions_value_check", sql`${t.dutyValue} >= 0`),
    check("hs_code_versions_base_check", sql`${t.dutyBase} is null or ${t.dutyBase} <@ array['goods', 'shipping', 'costs']::text[]`),
    check("hs_code_versions_per_check", sql`${t.fixedPer} is null or ${t.fixedPer} in ('unit', 'kg', 'shipment')`),
  ],
);

// ---------- مالیات ارزش افزوده و نرخ گمرکی ----------
// vat_base: goods، shipping، costs، duty (حقوق ورودی). customs_rate_for: برای کدام‌ها نرخ گمرکی ارز استفاده شود
// (duty، vat)؛ ارزی که نرخ گمرکی ندارد با نرخ بازار حساب می‌شود.
export const taxVersions = pgTable(
  "tax_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    vatPercent: numeric("vat_percent", { precision: 6, scale: 3 }).notNull(),
    vatBase: text("vat_base").array().notNull(),
    customsRateFor: text("customs_rate_for").array().notNull(),
    validFrom: validFrom(),
    note: text("note"),
    source: source(),
    createdBy: createdBy(),
    createdAt: createdAt(),
  },
  (t) => [
    index("tax_versions_valid_idx").on(t.validFrom),
    check("tax_versions_vat_check", sql`${t.vatPercent} >= 0 and ${t.vatPercent} <= 100`),
    check("tax_versions_base_check", sql`${t.vatBase} <@ array['goods', 'shipping', 'costs', 'duty']::text[]`),
    check("tax_versions_customs_check", sql`${t.customsRateFor} <@ array['duty', 'vat']::text[]`),
  ],
);
