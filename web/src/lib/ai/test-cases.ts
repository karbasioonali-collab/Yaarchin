import "server-only";
// سؤال‌های آزمون دستیار: نوشتن با تاریخچه، «بررسی شد» و قضاوت انسان روی نتیجه. docs/infoyaarchin.md بخش ۳۳.
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiTestCases, aiTestCaseVersions, aiTestResults } from "@/db/schema";
import { addSuggestion } from "./suggestions";
import type { TestExpect } from "./test-checks";

// jsonb ترتیب کلیدها را عوض می‌کند؛ مقایسه‌ی فیلدبه‌فیلد
const sameExpect = (a: TestExpect, b: TestExpect) =>
  a.handoff === b.handoff && a.source === b.source && a.forbidden.join("\n") === b.forbidden.join("\n") && a.mustInclude.join("\n") === b.mustInclude.join("\n");

export type CaseInput = {
  question: string;
  expectedAnswer: string;
  category: "normal" | "tricky" | "handoff";
  productSlug: string | null;
  expect: TestExpect;
  status: "active" | "draft";
};

export async function saveCase(id: string | null, v: CaseInput, by: string, source = "manual"): Promise<{ id: string; changed: boolean }> {
  return db.transaction(async (tx) => {
    let caseId = id;
    if (!caseId) {
      const [row] = await tx
        .insert(aiTestCases)
        .values({ ...v, source, createdBy: by, updatedBy: by, lastReviewedBy: by })
        .returning({ id: aiTestCases.id });
      caseId = row.id;
    } else {
      const [cur] = await tx.select().from(aiTestCases).where(eq(aiTestCases.id, caseId)).for("update");
      if (!cur) throw new Error("not found");
      const same =
        cur.question === v.question &&
        cur.expectedAnswer === v.expectedAnswer &&
        cur.category === v.category &&
        cur.productSlug === v.productSlug &&
        sameExpect(cur.expect, v.expect) &&
        cur.status === v.status;
      if (same) return { id: caseId, changed: false };
      await tx
        .update(aiTestCases)
        .set({ ...v, updatedBy: by, lastReviewedAt: new Date(), lastReviewedBy: by })
        .where(eq(aiTestCases.id, caseId));
    }
    await tx.insert(aiTestCaseVersions).values({ caseId, ...v, changedBy: by });
    return { id: caseId, changed: true };
  });
}

export async function markCaseReviewed(id: string, by: string): Promise<boolean> {
  const r = await db.update(aiTestCases).set({ lastReviewedAt: new Date(), lastReviewedBy: by }).where(eq(aiTestCases.id, id)).returning({ id: aiTestCases.id });
  return r.length > 0;
}

export async function caseVersions(id: string) {
  return db.select().from(aiTestCaseVersions).where(eq(aiTestCaseVersions.caseId, id)).orderBy(desc(aiTestCaseVersions.id)).limit(50);
}

// سؤال‌هایی که بیش از بازه‌ی بررسی پایگاه دانش (ai.kb_review_days) بررسی نشده‌اند ← فیلتر «نیاز به بررسی مجدد»
export const caseOverdueSql = (days: number) => lt(aiTestCases.lastReviewedAt, sql`now() - make_interval(days => ${days})`);

// قضاوت انسان: «درست» / «اشتباه». «اشتباه» ← سؤال به «پیشنهاد سؤال تازه» (test_wrong) می‌رود.
export async function setVerdict(resultId: number, verdict: "correct" | "wrong", by: string): Promise<{ runId: string } | null> {
  const [r] = await db
    .update(aiTestResults)
    .set({ verdict, verdictBy: by, verdictAt: new Date() })
    .where(and(eq(aiTestResults.id, resultId), eq(aiTestResults.status, "done")))
    .returning({ runId: aiTestResults.runId, question: aiTestResults.question, answer: aiTestResults.answer });
  if (!r) return null;
  if (verdict === "wrong") await addSuggestion({ question: r.question, kind: "test_wrong", detail: (r.answer ?? "").slice(0, 300) });
  return { runId: r.runId };
}
