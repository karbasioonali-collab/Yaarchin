# Migration 0014 — پیش‌نویس متن فارسی محصول با AI

- **وضعیت:** ✅ تأیید شد (2026-11-01).
  - روی Postgres محلی سندباکس تست شد: قبل از migrate (دیتابیس ۰۰۱۳) و بعد از migrate.
  - **روی لیارا هنوز اجرا نشده.** مالک بعد از استقرار کد اجرا می‌کند.
- **فایل SQL:** `web/drizzle/0014_catalog_text.sql`
- **نوع تغییر:** فقط افزودنی: **۱ جدول تازه**. به هیچ جدول یا ستون موجودی دست نمی‌زند.
- **تعریف در کد:** `web/src/db/schema/catalog-text.ts`. توضیح کامل: `docs/infoyaarchin.md` بخش ۴۰.

| ستون | چیست |
|---|---|
| `id` | uuid |
| `product_id` | محصول؛ با حذف محصول CASCADE |
| `status` | `ready` / `blocked` / `error` (CHECK `product_text_drafts_status_check`) |
| `input` | jsonb؛ همان چیزی که واقعاً به AI رفت (بدون اطلاعات کارخانه) |
| `output` | jsonb؛ `{titleFa, summaryFa, descriptionFa, specs}` بعد از یکسان‌سازی |
| `guard_hits` | jsonb؛ دلیل رد شدن |
| `ai_request_id` | ردیف `ai_requests`؛ SET NULL |
| `cost_toman`، `model` | هزینه‌ی واقعی و مدل |
| `created_by`، `created_at` | سازنده (SET NULL) و زمان |

- **ایندکس:** `(product_id, created_at)`.
- **Seed** (داده، نه ساختار): تنظیم `ai.catalog_daily_cost_toman` (۲۰٬۰۰۰ تومان).
- **قبل از migrate** هیچ صفحه‌ای خطا نمی‌دهد (`catalogTextReady()`). تست: `web/tests/e2e/catalog-text-pre.e2e.mjs`.

## اجرا روی لیارا (به همین ترتیب)
1. بک‌آپ دستی دیتابیس `yaarchin-db` در پنل لیارا.
2. Merge و صبر تا «Deploy to Liara» سبز شود.
3. در کنسول برنامه:
   - `npm run db:migrate`
   - `npm run db:seed`
4. ادامه: `docs/liara-setup.md` بخش ۲۴.
