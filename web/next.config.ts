import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // لیارا هم خودش standalone را روشن می‌کند؛ اینجا صریح است تا محلی و روی سرور یکی باشد.
  output: "standalone",
  // اسکریپت‌های دیتابیس (migrate/seed/create-admin) و فایل‌های لازمشان در خروجی standalone هم باشند
  // تا از کنسول لیارا با npm run قابل اجرا باشند.
  outputFileTracingIncludes: {
    "/api/v1/health": [
      "./scripts/**/*",
      "./drizzle/**/*",
      "./src/db/seed-data.json",
      "./node_modules/drizzle-orm/**/*",
      "./node_modules/pg/**/*",
      "./node_modules/pg-*/**/*",
      "./node_modules/@node-rs/**/*",
    ],
  },
};

export default nextConfig;
