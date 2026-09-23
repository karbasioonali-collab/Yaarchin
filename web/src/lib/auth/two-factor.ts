import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db/client";
import { userRecoveryCodes, userTotp } from "@/db/schema";
import { decrypt, encrypt, sha256Hex } from "@/lib/crypto";
import { generateTotpSecret, verifyTotp } from "./totp";

const RECOVERY_CODE_COUNT = 8;

// رمز TOTP تأییدنشده را برمی‌گرداند یا یکی تازه می‌سازد (برای صفحه‌ی راه‌اندازی).
export async function getOrCreatePendingSecret(userId: string): Promise<string> {
  const [row] = await db.select().from(userTotp).where(eq(userTotp.userId, userId));
  if (row && !row.confirmedAt) return decrypt(row.secretEncrypted);
  if (row?.confirmedAt) throw new Error("2FA already confirmed");
  const secret = generateTotpSecret();
  await db.insert(userTotp).values({ userId, secretEncrypted: encrypt(secret) });
  return secret;
}

// بررسی کد. اگر درست باشد step مصرف می‌شود تا همان کد دوباره قبول نشود.
export async function checkTotp(userId: string, code: string, opts: { confirming?: boolean } = {}): Promise<boolean> {
  const [row] = await db.select().from(userTotp).where(eq(userTotp.userId, userId));
  if (!row) return false;
  if (!opts.confirming && !row.confirmedAt) return false;
  const step = verifyTotp(decrypt(row.secretEncrypted), code, row.lastUsedStep ?? null);
  if (step === null) return false;
  await db
    .update(userTotp)
    .set({ lastUsedStep: step, ...(opts.confirming ? { confirmedAt: new Date() } : {}) })
    .where(eq(userTotp.userId, userId));
  return true;
}

function formatCode(): string {
  const raw = randomBytes(5).toString("hex").toUpperCase(); // ۱۰ کاراکتر
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

function normalizeRecovery(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-F]/g, "");
}

// کدهای قبلی حذف و کدهای جدید ساخته می‌شوند. متن خام فقط همین یک بار نمایش داده می‌شود.
export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, formatCode);
  await db.transaction(async (tx) => {
    await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
    await tx
      .insert(userRecoveryCodes)
      .values(codes.map((c) => ({ userId, codeHash: sha256Hex(normalizeRecovery(c)) })));
  });
  return codes;
}

export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const hash = sha256Hex(normalizeRecovery(code));
  const updated = await db
    .update(userRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(
      and(eq(userRecoveryCodes.userId, userId), eq(userRecoveryCodes.codeHash, hash), isNull(userRecoveryCodes.usedAt)),
    )
    .returning({ id: userRecoveryCodes.id });
  return updated.length > 0;
}

// ریست ورود دومرحله‌ای (توسط ادمین، وقتی کاربر گوشی و کدهای بازیابی را گم کرده)
export async function resetTwoFactor(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userTotp).where(eq(userTotp.userId, userId));
    await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
  });
}
