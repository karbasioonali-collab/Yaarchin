import "server-only";
import { sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";

// کدام migrationها روی دیتابیس فعلی اجرا شده‌اند؟ (یک کوئری سبک در هر درخواست)
// روی لیارا فایل migration همراه کد جدید می‌رسد، پس npm run db:migrate فقط «بعد» از استقرار کد جدید قابل اجراست.
// در این فاصله کد جدید نباید به جدول یا ستونی که هنوز نیست دست بزند (docs/infoyaarchin.md بخش ۱۵ و ۱۶).
const schemaState = cache(async (): Promise<{ catalog: boolean; importScore: boolean; customer: boolean; catalogAdmin: boolean }> => {
  const r = await db.execute<{ catalog: boolean; import_score: boolean; customer: boolean; catalog_admin: boolean }>(sql`
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
                    where table_schema = 'public' and table_name = 'products' and column_name = 'units_per_carton')) as catalog_admin`);
  return {
    catalog: r.rows[0]?.catalog === true,
    importScore: r.rows[0]?.import_score === true,
    customer: r.rows[0]?.customer === true,
    catalogAdmin: r.rows[0]?.catalog_admin === true,
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
