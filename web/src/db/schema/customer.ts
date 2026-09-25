// مشتری سایت: علاقه‌مندی، پروفایل کسب‌وکار، دسته‌های مورد علاقه و کد ورود پیامکی.
// خود مشتری یک ردیف users با نقش customer است (نقش غیرکارمند؛ به پنل دسترسی ندارد).
// رفتار مشتری (بازدید، ورود، علاقه‌مندی) در جدول events ثبت می‌شود، نه اینجا (docs/infoyaarchin.md بخش ۱۸).
import { sql } from "drizzle-orm";
import { boolean, check, index, inet, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_common";
import { users } from "./auth";
import { categories, products } from "./catalog";

// ---------- علاقه‌مندی ----------
export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] }), index("favorites_product_idx").on(t.productId)],
);

// ---------- پروفایل کسب‌وکار (اختیاری؛ در ثبت‌نام پرسیده نمی‌شود) ----------
// برای امتیاز جدیت مشتری (lead scoring) هم استفاده می‌شود؛ پس ستون‌های مشخص، نه JSON.
export const BUSINESS_TYPES = ["shop", "wholesale", "online", "personal", "other"] as const;

export const customerProfiles = pgTable(
  "customer_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    // مغازه، عمده‌فروش، فروش آنلاین، مصرف شخصی، سایر (خالی = نگفته)
    businessType: text("business_type", { enum: BUSINESS_TYPES }),
    city: text("city"),
    // سابقه‌ی واردات: true دارم، false ندارم، null نگفته
    hasImportExperience: boolean("has_import_experience"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "customer_profiles_business_type_check",
      sql`${t.businessType} in ('shop', 'wholesale', 'online', 'personal', 'other')`,
    ),
  ],
);

// دسته‌های مورد علاقه‌ی مشتری
export const customerInterests = pgTable(
  "customer_interests",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.categoryId] }), index("customer_interests_category_idx").on(t.categoryId)],
);

// ---------- کد یک‌بارمصرف پیامکی (ورود یا تأیید موبایل) ----------
// فقط هش کد ذخیره می‌شود. تا سوئیچ features.sms خاموش است، استفاده نمی‌شود.
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: id(),
    identifier: text("identifier").notNull(), // موبایل استاندارد 09xxxxxxxxx
    purpose: text("purpose", { enum: ["login", "verify"] }).notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ip: inet("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("otp_codes_identifier_idx").on(t.identifier, t.createdAt),
    check("otp_codes_purpose_check", sql`${t.purpose} in ('login', 'verify')`),
  ],
);
