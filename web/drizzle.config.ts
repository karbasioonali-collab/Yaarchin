import { defineConfig } from "drizzle-kit";

// migrationها فقط تولید می‌شوند (npm run db:generate) و بعد از تأیید مالک اعمال می‌شوند (npm run db:migrate).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
