// اعمال migrationهای پوشه‌ی drizzle/ روی DATABASE_URL.
// بدون drizzle-kit کار می‌کند تا روی سرور (لیارا) هم قابل اجرا باشد.
// قانون: فقط بعد از تأیید مالک و گرفتن بک‌آپ اجرا شود.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL تنظیم نشده است.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  console.log("migrationها اعمال شدند.");
} catch (e) {
  console.error("خطا در migration:", e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
