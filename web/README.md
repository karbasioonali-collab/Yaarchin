# یارچین — سایت و پنل ادمین (web)

Next.js 16 (App Router) + Postgres + Drizzle ORM.

## اجرا (محلی)
```bash
cd web
cp .env.example .env      # مقدارها را پر کنید
npm install
npm run dev
```

## دستورها
| دستور | کار |
|---|---|
| `npm run dev` / `build` / `start` | اجرا و ساخت |
| `npm run typecheck` / `lint` | بررسی کد |
| `npm run db:generate` | تولید فایل SQL migration از روی `src/db/schema/` |
| `npm run db:migrate` | اعمال migrationها. **فقط بعد از تأیید مالک** |

## قانون migration
هر تغییر schema باید این مراحل را طی کند:
1. `db:generate`
2. نوشتن توضیح در `docs/db/`
3. تأیید مالک
4. بک‌آپ دیتابیس
5. `db:migrate`

تغییرات فقط اضافه‌کردنی باشند: جدول یا ستون جدید، بدون حذف یا تغییر رابطه‌ی اصلی.
