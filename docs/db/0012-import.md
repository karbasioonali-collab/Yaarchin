# Migration 0012 — ورود از صفحه‌ی ذخیره‌شده‌ی علی‌بابا

- **وضعیت:** ✅ تأیید شد (2026-10-31).
  - روی Postgres محلی سندباکس تست شد: قبل از migrate (دیتابیس ۰۰۱۱)، بعد از migrate با seed.
  - **روی لیارا هنوز اجرا نشده.** مالک بعد از استقرار کد اجرا می‌کند.
- **فایل SQL:** `web/drizzle/0012_import.sql`
- **نوع تغییر:** فقط افزودنی: **۳ جدول تازه**. به هیچ جدول یا ستون موجودی دست نمی‌زند.
- **تعریف در کد:** `web/src/db/schema/import.ts`. توضیح کامل: `docs/infoyaarchin.md` بخش ۳۶.

| جدول | چیست |
|---|---|
| `raw_pages` | هر صفحه‌ی واردشده: منبع (upload/extension)، پلتفرم، لینک، شناسه‌ی محصول و فروشگاه، عنوان، sha256 فایل (یکتا)، اسم و حجم فایل، HTML فشرده (bytea)، عکس‌های داخل فایل (jsonb)، نتیجه‌ی خواننده (jsonb)، نسخه‌ی خواننده، وضعیت (new/reviewed/imported/rejected، CHECK)، دلیل رد، پیوند به لیستینگ/فروشنده/محصول (PR سوم)، آپلودکننده، بررسی‌کننده |
| `raw_page_images` | عکس‌های اصلی هر صفحه: لینک، ترتیب، نوع، حجم، و **یا** بایت‌ها (bytea، موقت) **یا** `storage_key` (بعد از انتقال به S3)؛ قید CHECK دقیقاً یکی. یکتا روی (صفحه، لینک) |
| `listing_external_ids` | شناسه‌ی محصول در پلتفرم ← لیستینگ؛ یکتا روی (platform, external_id). مثل `company_external_ids` |

- **کلیدهای خارجی:** عکس‌ها با حذف صفحه CASCADE؛ `listing_external_ids` با حذف لیستینگ CASCADE؛ پیوندهای `raw_pages` به لیستینگ، فروشنده، محصول و کاربرها SET NULL.
- **ایندکس‌ها:** `raw_pages (sha256)` یکتا، `(status, created_at)`، `(platform, external_product_id)`، `(platform, store_id)`؛ `listing_external_ids (listing_id)`.
- **Seed** (داده، نه ساختار): دسترسی‌های `catalog.import`، `companies.links` و `products.publish`.
- **قبل از migrate** هیچ صفحه‌ای خطا نمی‌دهد (`importReady()`). تست: `web/tests/e2e/import-pre.e2e.mjs`.
- **حجم:** هر صفحه حدود ۰٫۲۵ مگابایت (HTML فشرده + عکس‌های اصلی). هشدار پنل در ۱ گیگابایت عکس. راه انتقال عکس‌ها به S3: بخش ۳۶.

## اجرا روی لیارا (به همین ترتیب)
1. بک‌آپ دستی دیتابیس `yaarchin-db` در پنل لیارا.
2. Merge و صبر تا «Deploy to Liara» سبز شود.
3. در کنسول برنامه:
   - `npm run db:migrate`
   - `npm run db:seed`
4. ادامه: `docs/liara-setup.md` بخش ۲۲.
