// بعد از build اجرا می‌شود (npm «postbuild»). اگر خروجی standalone ساخته شده ولی فایل‌هایی که
// دستورهای کنسول لیارا لازم دارند داخلش نیست، build را متوقف می‌کند تا خطا همان موقع دیده شود،
// نه بعداً در کنسول سرور. سابقه: docs/infoyaarchin.md، بخش «درس‌های استقرار روی لیارا».
import { existsSync } from "node:fs";

const root = new URL("../.next/standalone/", import.meta.url);
if (!existsSync(root)) {
  console.log("verify-standalone: خروجی standalone وجود ندارد؛ بررسی رد شد.");
  process.exit(0);
}

const required = [
  "package.json",
  "scripts/migrate.mjs",
  "scripts/seed.mjs",
  "scripts/create-admin.mjs",
  "drizzle/meta/_journal.json",
  "src/db/seed-data.json",
  "node_modules/drizzle-orm/node-postgres/migrator.js",
  "node_modules/pg/package.json",
  "node_modules/@node-rs/argon2/package.json",
];
const missing = required.filter((p) => !existsSync(new URL(p, root)));
if (missing.length) {
  console.error("verify-standalone: این فایل‌ها در خروجی standalone نیستند:");
  for (const m of missing) console.error("  - " + m);
  console.error("احتمالاً next.config.js خوانده نشده یا outputFileTracingIncludes ناقص است.");
  process.exit(1);
}
console.log("verify-standalone: همه‌ی فایل‌های لازم برای دستورهای کنسول موجودند.");
