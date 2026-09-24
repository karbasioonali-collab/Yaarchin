// ⚠️ این فایل باید next.config.js بماند (نه .ts یا .mjs).
// لیارا فقط دنبال next.config.js می‌گردد؛ اگر پیدا نکند، خودش یک next.config.js تازه فقط با
// output: "standalone" می‌سازد و Next.js همیشه next.config.js را به .ts ترجیح می‌دهد،
// پس تنظیمات ما (از جمله بسته‌بندی اسکریپت‌های دیتابیس) کلاً نادیده گرفته می‌شد.
// جزئیات: docs/infoyaarchin.md، بخش «درس‌های استقرار روی لیارا».

/** @type {import('next').NextConfig} */
const nextConfig = {
  // خروجی standalone: لیارا از همین پوشه ایمیج اجرا را می‌سازد.
  output: "standalone",
  // بررسی TypeScript در گیت‌هاب اکشن (npm run typecheck) قبل از استقرار انجام می‌شود؛ تکرارش در build لیارا
  // فقط وقت می‌گیرد و build پلن رایگان لیارا سقف ۵ دقیقه دارد (docs/infoyaarchin.md بخش ۱۲).
  typescript: { ignoreBuildErrors: true },
  // اسکریپت‌های دیتابیس (migrate/seed/create-admin) و فایل‌های لازمشان داخل خروجی standalone
  // کپی شوند تا از کنسول لیارا با npm run قابل اجرا باشند.
  // اسکریپت یا وابستگی تازه‌ای اضافه شد؟ اینجا هم اضافه کن (scripts/verify-standalone.mjs چک می‌کند).
  outputFileTracingIncludes: {
    "/api/v1/health": [
      "./scripts/**/*",
      "./drizzle/**/*",
      "./src/db/seed-data.json",
      "./src/lib/auth/password-policy.mjs",
      // فقط فایل‌هایی که Node واقعاً اجرا می‌کند (ESM .js)؛ .d.ts/.cjs/.map حذف شدند (۴۴۹ فایل به‌جای ۲۶۹۰).
      "./node_modules/drizzle-orm/package.json",
      "./node_modules/drizzle-orm/**/*.js",
      "./node_modules/pg/**/*",
      "./node_modules/pg-*/**/*",
      "./node_modules/@node-rs/**/*",
    ],
  },
};

module.exports = nextConfig;
