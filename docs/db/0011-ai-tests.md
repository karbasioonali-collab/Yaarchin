# Migration 0011 — آزمون دستیار و «پیشنهاد سؤال تازه»

- **وضعیت:** ✅ تأیید شد (2026-10-28).
  - روی Postgres محلی سندباکس تست شد: قبل از migrate (دیتابیس ۰۰۱۰)، بعد از migrate با seed.
  - **روی لیارا هنوز اجرا نشده.** مالک بعد از استقرار کد اجرا می‌کند.
- **فایل SQL:** `web/drizzle/0011_ai_tests.sql`
- **نوع تغییر:** فقط افزودنی: **۵ جدول تازه**. به هیچ جدول یا ستون موجودی دست نمی‌زند (هیچ DROP یا ALTER روی جدول‌های قبلی).
- **تعریف در کد:** `web/src/db/schema/ai-tests.ts`. توضیح کامل: `docs/infoyaarchin.md` بخش ۳۳.

| جدول | چیست |
|---|---|
| `ai_test_cases` | سؤال آزمون: متن، جواب درست، دسته (normal/tricky/handoff، CHECK)، slug محصول، انتظارها (`expect` jsonb)، وضعیت (active/draft، CHECK)، منبع (seed/manual/suggestion)، سازنده، ویرایشگر، آخرین بررسی |
| `ai_test_case_versions` | تاریخچه‌ی هر ذخیره‌ی سؤال آزمون |
| `ai_test_runs` | هر اجرا: وضعیت (running/done/stopped/interrupted/failed)، حالت (live/test، CHECK)، دامنه (jsonb)، مدل، نسخه‌ی دستورالعمل، شمارنده‌ها، هزینه‌ی تخمینی و واقعی، درخواست توقف، شروع‌کننده، زمان شروع/پایان، ضربان |
| `ai_test_results` | نتیجه‌ی هر سؤال در هر اجرا: متن سؤال و انتظارها در لحظه‌ی اجرا، وضعیت، مسیر، جواب، منبع، دلیل ارجاع، بررسی‌های خودکار، قضاوت انسان (CHECK)، درخواست مدل، هزینه، زمان |
| `ai_suggestions` | «پیشنهاد سؤال تازه»: کلید یکسان‌شده، متن، برچسب، توضیح، تعداد، وضعیت (open/kb/test/dismissed، CHECK)، گفتگو و پیام، پیوند به مورد ساخته‌شده، رسیدگی‌کننده، اولین و آخرین بار. یکتا روی (کلید، برچسب) |

- **کلیدهای خارجی:**
  - نسخه‌ها و نتیجه‌ها با حذف سؤال یا اجرا: نسخه CASCADE، نتیجه‌ی اجرا CASCADE، و `case_id` نتیجه SET NULL (نتیجه با متن ذخیره‌شده‌ی خودش می‌ماند).
  - `ai_test_results.request_id` ← `ai_requests` SET NULL.
  - `ai_suggestions.conversation_id` و `message_id` SET NULL.
  - همه‌ی ستون‌های کاربر SET NULL.
- **ایندکس‌ها:** `ai_test_cases (status, category)`؛ `ai_test_case_versions (case_id, created_at)`؛ `ai_test_runs (started_at)`؛ `ai_test_results (run_id, position)` و `(case_id, created_at)`؛ `ai_suggestions (status, last_seen_at)` و یکتای `(question_key, kind)`.
- **Seed** (داده، نه ساختار):
  - دسترسی `ai.tests`.
  - تنظیم‌های `ai.test_daily_cost_toman` (۵۰٬۰۰۰) و `ai.test_stale_days` (۱۴).
  - ۳۸ سؤال آزمون از `web/src/db/test-drafts.json` (وضعیت «فعال»). فقط وقتی جدول خالی است.
- **قبل از migrate** هیچ صفحه‌ای خطا نمی‌دهد (`aiTestsReady()`):
  - دستیار و چت مثل قبل؛ صفحه‌های آزمون و پیشنهاد پیام «بعد از migration ۰۰۱۱» می‌دهند.
  - تست: `web/tests/e2e/ai-tests-pre.e2e.mjs`.

## اجرا روی لیارا (به همین ترتیب)
1. بک‌آپ دستی دیتابیس `yaarchin-db` در پنل لیارا.
2. Merge و صبر تا «Deploy to Liara» سبز شود.
3. در کنسول برنامه:
   - `npm run db:migrate`
   - `npm run db:seed`
4. ادامه (اولین آزمون): `docs/liara-setup.md` بخش ۲۱.
