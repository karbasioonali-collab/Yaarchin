# Migration 0002 — امتیاز «جذاب برای واردات» محصولات

- **وضعیت:** ✅ تأیید شد (2026-09-25).
  - روی Postgres محلی سندباکس اجرا و تست شد.
  - روی دیتابیسی در وضعیت فعلی لیارا (۰۰۰۰ + ۰۰۰۱ + داده‌ی demo) هم تست شد.
  - **روی لیارا هنوز اجرا نشده.** مالک بعد از استقرار کد اجرا می‌کند.
- **فایل SQL:** `web/drizzle/0002_product_import_score.sql`
- **نوع تغییر:** فقط افزودنی. یک ستون اختیاری و یک CHECK constraint؛ هیچ ستون یا داده‌ی موجودی عوض نمی‌شود.

```sql
ALTER TABLE "products" ADD COLUMN "import_score" numeric(2, 1);
ALTER TABLE "products" ADD CONSTRAINT "products_import_score_check"
  CHECK ("products"."import_score" in (1, 2, 3, 4, 4.5, 5));
```

- `import_score` خالی (NULL) یعنی «بدون امتیاز». CHECK روی NULL خطا نمی‌دهد.
- هر مقدار دیگری (مثلاً ۳٫۵ یا ۶) را **خود دیتابیس** رد می‌کند، حتی اگر کد اشتباه کند.
- محصولات فعلی بعد از migration بدون امتیازند.

## اجرا روی لیارا (به همین ترتیب)
1. بک‌آپ دیتابیس `yaarchin-db`.
2. Merge و صبر تا «Deploy to Liara» سبز شود. در این فاصله سایت بدون ستاره و بدون خطا کار می‌کند.
3. در کنسول برنامه:
   - `npm run db:migrate`
   - `npm run db:seed`: دسترسی تازه‌ی `products.rate`.
   - `npm run db:seed-demo`: امتیاز‌های نمونه.
     - فقط اگر داده‌ی demo می‌خواهید.
     - اگر قبل از migrate اجرا شود، با پیام «اول db:migrate» متوقف می‌شود.
