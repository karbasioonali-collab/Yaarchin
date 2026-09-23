import "server-only";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { requestMeta } from "@/lib/request";
import { getSetting } from "@/lib/settings";

export const SESSION_COOKIE = "yc_session";
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type SessionRow = typeof sessions.$inferSelect;

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const hours = Number(await getSetting<number>("auth.session_hours")) || 72;
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000);
  const { ip, userAgent } = await requestMeta();
  await db.insert(sessions).values({ id: sha256Hex(token), userId, expiresAt, ip, userAgent });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

// نشست معتبر فعلی (یا null). فقط هش توکن در دیتابیس جستجو می‌شود.
export async function readSession(): Promise<SessionRow | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sha256Hex(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.id));
  }
  return row;
}

export async function updateSession(id: string, patch: Partial<Pick<SessionRow, "twoFactorVerifiedAt" | "impersonatingUserId">>) {
  await db.update(sessions).set(patch).where(eq(sessions.id, id));
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sha256Hex(token)));
  }
  jar.delete(SESSION_COOKIE);
}

// مثلاً بعد از تغییر رمز یا غیرفعال‌شدن کاربر
export async function revokeAllSessions(userId: string, exceptId?: string): Promise<void> {
  const conds = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (exceptId) conds.push(ne(sessions.id, exceptId));
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(...conds));
}
