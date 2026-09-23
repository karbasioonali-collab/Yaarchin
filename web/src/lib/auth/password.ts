import "server-only";
import { hash, verify } from "@node-rs/argon2";

// argon2id با تنظیمات پیشنهادی OWASP.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTS);
}

export async function verifyPassword(hashed: string | null, plain: string): Promise<boolean> {
  if (!hashed) return false;
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

// برای جلوگیری از تشخیص وجود کاربر از روی زمان پاسخ
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= hashPassword("yarchin-dummy-password");
  await verifyPassword(await dummyHash, plain);
}
