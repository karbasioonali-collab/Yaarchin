"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/can";
import { fmtImportScore, IMPORT_SCORES, toImportScore } from "@/lib/catalog/import-score";
import { importScoreReady } from "@/lib/db-ready";

// ثبت/ویرایش امتیاز «جذاب برای واردات». فقط با دسترسی products.rate (ادمین همیشه).
// مقدار فقط از فهرست مجاز پذیرفته می‌شود؛ دیتابیس هم با CHECK constraint همین را کنترل می‌کند.
export async function setImportScoreAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("products.rate");
  if (!(await importScoreReady())) return { error: "ستون امتیاز هنوز ساخته نشده؛ در کنسول لیارا npm run db:migrate را اجرا کنید." };

  const id = String(fd.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "محصول نامعتبر است." };
  const raw = String(fd.get("score") ?? "").trim();
  const score = toImportScore(raw);
  // «خالی» یعنی حذف امتیاز؛ هر چیز دیگری که در فهرست نیست رد می‌شود (نه اینکه بی‌صدا null شود)
  if (raw !== "" && score === null) {
    return { error: `امتیاز فقط یکی از این‌هاست: ${IMPORT_SCORES.map((x) => fmtImportScore(x)).join("، ")}.` };
  }

  const [p] = await db.select({ importScore: products.importScore, titleFa: products.titleFa }).from(products).where(eq(products.id, id));
  if (!p) return { error: "محصول پیدا نشد." };
  const before = toImportScore(p.importScore);
  if (before === score) return { ok: "بدون تغییر." };

  await db.update(products).set({ importScore: score === null ? null : String(score) }).where(eq(products.id, id));
  await logActivity({
    actorUserId: a.user.id,
    actingAsUserId: a.session.impersonatingUserId,
    action: "product.import_score",
    entityType: "product",
    entityId: id,
    before: { importScore: before, title: p.titleFa },
    after: { importScore: score },
  });
  revalidatePath("/", "layout");
  return { ok: `ذخیره شد: ${fmtImportScore(before)} ← ${fmtImportScore(score)}` };
}
