import "server-only";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { loginAttempts } from "@/db/schema";
import { requestMeta } from "@/lib/request";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IDENTIFIER = 5;
const MAX_PER_IP = 30;

// آیا این شناسه/IP به‌خاطر تلاش‌های ناموفق زیاد موقتاً مسدود است؟
export async function isLoginBlocked(identifier: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byId] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.identifier, identifier), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));
  if (byId.n >= MAX_PER_IDENTIFIER) return true;
  const { ip } = await requestMeta();
  if (!ip) return false;
  const [byIp] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));
  return byIp.n >= MAX_PER_IP;
}

export async function recordLoginAttempt(a: {
  identifier: string;
  userId?: string | null;
  step: "password" | "sms";
  success: boolean;
  reason?: string;
}): Promise<void> {
  const { ip } = await requestMeta();
  await db.insert(loginAttempts).values({ ...a, userId: a.userId ?? null, ip });
}
