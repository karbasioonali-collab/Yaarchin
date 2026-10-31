# Migration 0013 — اصلاح‌های صفحه‌ی واردشده از علی‌بابا

- **وضعیت:** ✅ تأیید شد (2026-10-31).
  - روی Postgres محلی سندباکس تست شد: قبل از migrate (دیتابیس ۰۰۱۲) و بعد از migrate.
  - **روی لیارا هنوز اجرا نشده.** مالک بعد از استقرار کد اجرا می‌کند.
- **فایل SQL:** `web/drizzle/0013_import_edits.sql`
- **نوع تغییر:** فقط افزودنی: **۱ جدول تازه**. به هیچ جدول یا ستون موجودی دست نمی‌زند.
- **تعریف در کد:** `web/src/db/schema/import.ts`. توضیح کامل: `docs/infoyaarchin.md` بخش ۳۷.

| جدول | چیست |
|---|---|
| `raw_page_edits` | اصلاح‌های انسان روی هر صفحه‌ی واردشده: `raw_page_id` (کلید اصلی)، `data` (jsonb، فقط فیلدهایی که با خوانده‌شده فرق دارند)، `updated_by`، `updated_at` |

- **کلیدهای خارجی:** `raw_page_id` ← `raw_pages` با CASCADE؛ `updated_by` ← `users` با SET NULL.
- **Seed:** لازم نیست.
- **قبل از migrate** هیچ صفحه‌ای خطا نمی‌دهد (`importEditsReady()`): صفحه‌ی بررسی فقط‌خواندنی. تست: `web/tests/e2e/import-edits-pre.e2e.mjs`.

## اجرا روی لیارا (به همین ترتیب)
1. بک‌آپ دستی دیتابیس `yaarchin-db` در پنل لیارا.
2. Merge و صبر تا «Deploy to Liara» سبز شود.
3. در کنسول برنامه: `npm run db:migrate`
4. ادامه: `docs/liara-setup.md` بخش ۲۳.
