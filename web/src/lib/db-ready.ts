import "server-only";
import { sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";

// آیا جدول‌های migration ۰۰۰۱ (کاتالوگ و محتوای سایت) در دیتابیس هستند؟
// روی لیارا فایل migration همراه کد جدید می‌رسد، پس npm run db:migrate فقط «بعد» از استقرار کد جدید قابل اجراست.
// در این فاصله‌ی کوتاه، سایت به‌جای خطای ۵۰۰ با محتوای پیش‌فرض و بدون محصول نمایش داده می‌شود.
// (docs/infoyaarchin.md بخش ۱۵)
export const catalogReady = cache(async (): Promise<boolean> => {
  const r = await db.execute<{ ok: boolean }>(
    sql`select (to_regclass('public.site_blocks') is not null and to_regclass('public.price_observations') is not null and to_regclass('public.contact_messages') is not null) as ok`,
  );
  return r.rows[0]?.ok === true;
});
