# Migration 0004 — پنل کاتالوگ: وزن و کارتن، تماس‌ها، سابقه‌ی مکاتبه، زمان آماده‌سازی پله‌ای

- **وضعیت:** ✅ تأیید شد (2026-09-26).
  - روی Postgres محلی سندباکس اجرا و تست شد، هم قبل و هم بعد از migrate.
  - **روی لیارا هنوز اجرا نشده.** مالک بعد از استقرار کد اجرا می‌کند.
- **فایل SQL:** `web/drizzle/0004_catalog_admin.sql`
- **نوع تغییر:** فقط افزودنی: ۳ جدول، ۷ ستون اختیاری و ۲ CHECK. هیچ ستون یا داده‌ی موجودی عوض یا حذف نمی‌شود.
- **تعریف در کد:** `web/src/db/schema/catalog.ts`

| تغییر | چیست |
|---|---|
| `products`: `unit_weight_kg`، `carton_length_cm`، `carton_width_cm`، `carton_height_cm`، `carton_weight_kg`، `units_per_carton` | وزن هر عدد و کارتن، برای ماشین‌حساب هزینه‌ی حمل (مرحله‌ی نرخ‌ها). همه اختیاری؛ CHECK `products_packing_check`: اگر پر باشند، بزرگ‌تر از صفر |
| `companies.notes` | یادداشت داخلی کارخانه |
| جدول `company_contacts` | تماس‌های هر کارخانه: نام، سمت، تلفن، ایمیل، WeChat، WhatsApp، یادداشت. با حذف کارخانه پاک می‌شود |
| جدول `company_correspondence` | سابقه‌ی مکاتبه؛ **فقط افزودنی**. نوع، کانال و جهت با CHECK. `external_ref` یکتا برای هر (کارخانه، منبع) تا اکستنشن یک پیام را دو بار ثبت نکند. کارخانه‌ای که مکاتبه دارد حذف نمی‌شود (RESTRICT) |
| جدول `lead_time_observations` | زمان آماده‌سازی با پله‌ی تعداد؛ مثل قیمت، فقط افزودنی. CHECK: روز بین ۱ و ۷۳۰ |
| `price_observations_currency_check` | ارز قیمت فقط `USD` یا `CNY`. داده‌ی فعلی همه USD است، پس ساخت CHECK خطا نمی‌دهد |

- **Seed** (داده، نه ساختار): دسترسی‌های `categories.manage`، `companies.view`، `companies.manage`، `correspondence.create` و `products.manage`.
- **قبل از migrate** سایت و پنل خطا نمی‌دهند (`catalogAdminReady()` در `src/lib/db-ready.ts`):
  - سایت زمان آماده‌سازی را از ستون قدیمی `lead_time_days` می‌خواند.
  - فرم‌های کارخانه، تماس، مکاتبه، زمان آماده‌سازی، و وزن و کارتن پیام «بعد از migration ۰۰۰۴» می‌دهند.

## اجرا روی لیارا (به همین ترتیب)
1. بک‌آپ دیتابیس `yaarchin-db`.
2. Merge و صبر تا «Deploy to Liara» سبز شود.
3. در کنسول برنامه:
   - `npm run db:migrate`
   - `npm run db:seed`
   - (اختیاری) `npm run db:seed-demo` تا داده‌ی نمونه، تماس، مکاتبه و پله‌ی زمان آماده‌سازی نمونه بگیرد.
