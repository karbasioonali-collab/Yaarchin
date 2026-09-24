// بعد از build اجرا می‌شود (npm «postbuild»). اگر خروجی standalone ساخته شده ولی چیزی که دستورهای کنسول
// لیارا (migrate/seed/create-admin) لازم دارند داخلش نیست، build را متوقف می‌کند تا خطا همان موقع دیده شود،
// نه بعداً در کنسول سرور. سابقه: docs/infoyaarchin.md، بخش ۱۲ «درس‌های استقرار روی لیارا».
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../.next/standalone/", import.meta.url);
if (!existsSync(root)) {
  console.log("verify-standalone: خروجی standalone وجود ندارد؛ بررسی رد شد.");
  process.exit(0);
}

// ۱) فایل‌ها
const required = [
  "package.json",
  "scripts/migrate.mjs",
  "scripts/seed.mjs",
  "scripts/create-admin.mjs",
  "drizzle/meta/_journal.json",
  "src/db/seed-data.json",
  "src/lib/auth/password-policy.mjs",
];
const missing = required.filter((p) => !existsSync(new URL(p, root)));
if (missing.length) {
  console.error("verify-standalone: این فایل‌ها در خروجی standalone نیستند:");
  for (const m of missing) console.error("  - " + m);
  console.error("احتمالاً next.config.js خوانده نشده یا outputFileTracingIncludes ناقص است.");
  process.exit(1);
}

// ۲) پکیج‌ها: همان importهایی که اسکریپت‌ها دارند، واقعاً از داخل standalone اجرا شوند
// (چون outputFileTracingIncludes فقط فایل‌های فهرست‌شده را کپی می‌کند، نه وابستگی‌هایشان را).
const probe = `
  await import("drizzle-orm/node-postgres");
  await import("drizzle-orm/node-postgres/migrator");
  await import("pg");
  await import("@node-rs/argon2");
  await import("../src/lib/auth/password-policy.mjs");
`;
const r = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
  cwd: fileURLToPath(new URL("scripts/", root)),
  encoding: "utf8",
});
if (r.status !== 0) {
  console.error("verify-standalone: importهای اسکریپت‌های کنسول از داخل standalone اجرا نشدند:");
  console.error(r.stderr.trim());
  console.error("پکیج یا فایل لازم را به outputFileTracingIncludes در next.config.js اضافه کنید.");
  process.exit(1);
}
console.log("verify-standalone: همه‌ی فایل‌ها و پکیج‌های لازم برای دستورهای کنسول موجودند.");
