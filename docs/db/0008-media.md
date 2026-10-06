# Migration 0008 — فایل‌های آپلودی (عکس و ویدیو)

- **وضعیت:** ✅ تأیید شد (2026-10-06).
  - روی Postgres محلی سندباکس اجرا و تست شد، هم قبل و هم بعد از migrate.
  - **روی لیارا هنوز اجرا نشده.** مالک بعد از استقرار کد اجرا می‌کند.
- **فایل SQL:** `web/drizzle/0008_media.sql`
- **نوع تغییر:** فقط افزودنی: **یک جدول تازه** (`media_files`) با ایندکس‌ها و کلید خارجی خودش. به هیچ جدول، ستون یا داده‌ی موجودی دست نمی‌زند.
  - در برنامه‌ی اول یک ستون `media_file_id` روی `product_media` هم پیش‌بینی شده بود. اضافه **نشد**: ارتباط با کلید یکتای فایل (`media_files.key` = `product_media.storage_key`) برقرار است، و ستون تازه صفحه‌هایی را که همه‌ی ستون‌های `product_media` را می‌خوانند، در فاصله‌ی استقرار تا migrate خراب می‌کرد.
- **تعریف در کد:** `web/src/db/schema/media.ts`. توضیح کامل: `docs/infoyaarchin.md` بخش ۲۶.

| ستون | چیست |
|---|---|
| `key` (یکتا) | کلید storage: `img/<سال>/<ماه>/<تصادفی>` یا `vid/…/<تصادفی>.mp4\|webm` |
| `storage` | `local` (دیسک برنامه، حالت آزمایشی) یا `s3` (CHECK) |
| `kind` | `image` یا `video` (CHECK) |
| `mime`، `bytes`، `width`، `height`، `variants` | نوع ذخیره‌شده، جمع حجم اندازه‌ها، ابعاد، عرض اندازه‌ها (مثل `[480,1000,1800]`) |
| `sha256` (ایندکس) | اثر انگشت فایل ورودی؛ برای جلوگیری از ذخیره‌ی تکراری |
| `original_name`، `source` (`upload`/`url`/`extension`، CHECK)، `source_url`، `purpose` | از کجا و برای چه |
| `logo_check` (CHECK)، `logo_check_at`، `logo_check_note` | جای تشخیص لوگو با AI (فعلاً فقط ساختار) |
| `created_by` (SET NULL)، `created_at` (ایندکس) | چه کسی، کی |

- **Seed** (داده، نه ساختار): گروه تنظیم `media`:
  - `media.image_max_mb` = ۱۵
  - `media.batch_max` = ۲۰
  - `media.video_max_mb` = ۵۰
  - `media.test_total_mb` = ۱۵۰
  - `media.test_video_max_mb` = ۲۰
- **دسترسی تازه:** ندارد (`products.manage`، `categories.manage`، `site.manage` موجود).
- **قبل از migrate** سایت و پنل خطا نمی‌دهند (`mediaReady()`): فرم‌ها فقط فیلد آدرس را دارند و نوار «آپلود بعد از migration ۰۰۰۸» نشان می‌دهند؛ مسیر آپلود ۴۰۹ می‌دهد.

## اجرا روی لیارا (به همین ترتیب)
1. بک‌آپ دیتابیس `yaarchin-db`.
2. Merge و صبر تا «Deploy to Liara» سبز شود.
3. در کنسول برنامه:
   - `npm run db:migrate`
   - `npm run db:seed`
