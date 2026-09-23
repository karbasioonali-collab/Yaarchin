import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// یک Pool برای کل پروسه (در حالت dev هم با hot-reload دوباره ساخته نمی‌شود).
const globalForDb = globalThis as unknown as { yarchinPool?: Pool };

const pool =
  globalForDb.yarchinPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.yarchinPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
