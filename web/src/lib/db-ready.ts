import "server-only";
import { sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";

// کدام migrationها روی دیتابیس فعلی اجرا شده‌اند؟ (یک کوئری سبک در هر درخواست)
// روی لیارا فایل migration همراه کد جدید می‌رسد، پس npm run db:migrate فقط «بعد» از استقرار کد جدید قابل اجراست.
// در این فاصله کد جدید نباید به جدول یا ستونی که هنوز نیست دست بزند (docs/infoyaarchin.md بخش ۱۵ و ۱۶).
const schemaState = cache(async (): Promise<{ catalog: boolean; importScore: boolean; customer: boolean; catalogAdmin: boolean; rates: boolean; chat: boolean; followup: boolean }> => {
  const r = await db.execute<{ catalog: boolean; import_score: boolean; customer: boolean; catalog_admin: boolean; rates: boolean; chat: boolean; followup: boolean }>(sql`
    select
      (to_regclass('public.site_blocks') is not null and to_regclass('public.price_observations') is not null
        and to_regclass('public.contact_messages') is not null) as catalog,
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'products' and column_name = 'import_score') as import_score,
      (to_regclass('public.favorites') is not null and to_regclass('public.customer_profiles') is not null
        and to_regclass('public.customer_interests') is not null and to_regclass('public.otp_codes') is not null) as customer,
      (to_regclass('public.lead_time_observations') is not null and to_regclass('public.company_contacts') is not null
        and to_regclass('public.company_correspondence') is not null
        and exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'products' and column_name = 'units_per_carton')) as catalog_admin,
      (to_regclass('public.exchange_rates') is not null and to_regclass('public.shipping_method_versions') is not null
        and to_regclass('public.cost_item_versions') is not null and to_regclass('public.hs_code_versions') is not null
        and to_regclass('public.tax_versions') is not null) as rates,
      (to_regclass('public.conversations') is not null and to_regclass('public.chat_messages') is not null
        and to_regclass('public.conversation_reads') is not null and to_regclass('public.conversation_flags') is not null) as chat,
      (to_regclass('public.inquiries') is not null and to_regclass('public.inquiry_supplier_events') is not null
        and to_regclass('public.sms_outbox') is not null and to_regclass('public.staff_notification_prefs') is not null) as followup`);
  return {
    catalog: r.rows[0]?.catalog === true,
    importScore: r.rows[0]?.import_score === true,
    customer: r.rows[0]?.customer === true,
    catalogAdmin: r.rows[0]?.catalog_admin === true,
    rates: r.rows[0]?.rates === true,
    chat: r.rows[0]?.chat === true,
    followup: r.rows[0]?.followup === true,
  };
});

// migration ۰۰۰۱: جدول‌های کاتالوگ و محتوای سایت
export const catalogReady = cache(async () => (await schemaState()).catalog);

// migration ۰۰۰۲: ستون products.import_score
export const importScoreReady = cache(async () => (await schemaState()).importScore);

// migration ۰۰۰۳: علاقه‌مندی، پروفایل کسب‌وکار، دسته‌های مورد علاقه و کد پیامکی مشتری
export const customerReady = cache(async () => (await schemaState()).customer);

// migration ۰۰۰۴: پنل کاتالوگ (ستون‌های وزن/کارتن، تماس‌ها، سابقه‌ی مکاتبه، پله‌های زمان آماده‌سازی)
export const catalogAdminReady = cache(async () => (await schemaState()).catalogAdmin);

// migration ۰۰۰۵: نرخ‌ها و هزینه‌ها (ارز، حمل، هزینه‌ها، HS code، مالیات)
export const ratesReady = cache(async () => (await schemaState()).rates);

// migration ۰۰۰۶: چت مشتری با کارشناس (گفتگوها، پیام‌ها، خوانده‌شدن، برچسب‌های مرحله‌ی AI)
export const chatReady = cache(async () => (await schemaState()).chat);

// migration ۰۰۰۷: پیگیری کارخانه‌ها برای درخواست مشتری، صف پیامک و تنظیم پیامک هر کارمند
export const followupReady = cache(async () => (await schemaState()).followup);
