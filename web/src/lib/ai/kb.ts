import "server-only";
// پایگاه دانش: جستجوی متنی ساده (بدون embedding؛ تصمیم مالک) و نوشتن با تاریخچه. docs/infoyaarchin.md بخش ۲۹.
// جستجو در خود برنامه انجام می‌شود: پایگاه دانش چند صد مورد است؛ همه‌ی موردهای فعال یک بار خوانده و امتیازدهی می‌شوند
// (کلمه‌های مشترک سؤال مشتری با سؤال و شکل‌های دیگرش وزن ۳، با جواب وزن ۱). بعداً اگر لازم شد: embedding بدون pgvector
// (بردار در jsonb و شباهت کسینوسی در برنامه) یا pgvector اگر روی دیتابیس فعال باشد (صفحه‌ی «دستیار هوشمند» نشان می‌دهد).
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { kbItems, kbItemVersions } from "@/db/schema";
import { getSetting } from "@/lib/settings";
import { type KbHit, scoreKb } from "./kb-score";

export type { KbHit };

export type KbItem = typeof kbItems.$inferSelect;
export async function searchKb(query: string, limit = 5): Promise<KbHit[]> {
  const items = await db
    .select({ id: kbItems.id, question: kbItems.question, answer: kbItems.answer, variants: kbItems.variants })
    .from(kbItems)
    .where(eq(kbItems.status, "active"));
  return scoreKb(query, items, limit);
}

export const reviewDays = async () => {
  const v = Number(await getSetting("ai.kb_review_days"));
  return Number.isInteger(v) && v >= 1 && v <= 3650 ? v : 30;
};

// موردهایی که بیش از بازه‌ی بررسی، بررسی نشده‌اند (هشدار پنل و فیلتر «نیاز به بررسی مجدد»)
export async function overdueCount(): Promise<number> {
  const days = await reviewDays();
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(kbItems)
    .where(lt(kbItems.lastReviewedAt, sql`now() - make_interval(days => ${days})`));
  return r?.n ?? 0;
}

export type KbInput = { question: string; answer: string; variants: string[]; category: string | null; status: "active" | "draft" };

export async function saveKb(id: string | null, v: KbInput, by: string): Promise<{ id: string; changed: boolean }> {
  return db.transaction(async (tx) => {
    let itemId = id;
    if (!itemId) {
      const [row] = await tx
        .insert(kbItems)
        .values({ ...v, createdBy: by, updatedBy: by, lastReviewedBy: by })
        .returning({ id: kbItems.id });
      itemId = row.id;
    } else {
      const [cur] = await tx.select().from(kbItems).where(eq(kbItems.id, itemId)).for("update");
      if (!cur) throw new Error("not found");
      const same =
        cur.question === v.question &&
        cur.answer === v.answer &&
        JSON.stringify(cur.variants) === JSON.stringify(v.variants) &&
        cur.category === v.category &&
        cur.status === v.status;
      if (same) return { id: itemId, changed: false };
      // ویرایش متن = بررسی هم شده
      await tx
        .update(kbItems)
        .set({ ...v, updatedBy: by, lastReviewedAt: new Date(), lastReviewedBy: by })
        .where(eq(kbItems.id, itemId));
    }
    await tx.insert(kbItemVersions).values({ itemId, ...v, changedBy: by });
    return { id: itemId, changed: true };
  });
}

export async function markReviewed(id: string, by: string): Promise<boolean> {
  const r = await db.update(kbItems).set({ lastReviewedAt: new Date(), lastReviewedBy: by }).where(eq(kbItems.id, id)).returning({ id: kbItems.id });
  return r.length > 0;
}

export async function versionsOf(id: string) {
  return db
    .select()
    .from(kbItemVersions)
    .where(and(eq(kbItemVersions.itemId, id)))
    .orderBy(desc(kbItemVersions.id))
    .limit(50);
}
