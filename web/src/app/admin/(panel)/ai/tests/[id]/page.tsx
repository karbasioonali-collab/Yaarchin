import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { aiTestCases, aiTestResults, users } from "@/db/schema";
import { reviewDays } from "@/lib/ai/kb";
import { caseVersions } from "@/lib/ai/test-cases";
import { requirePermission } from "@/lib/auth/can";
import { aiTestsReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import styles from "../../../panel.module.css";
import { reviewCaseAction, saveCaseAction } from "../actions";
import { CaseFields } from "../CaseFields";
import { CATEGORY_FA, PATH_FA } from "../labels";

export const metadata: Metadata = { title: "سؤال آزمون" };

export default async function TestCasePage({ params }: PageProps<"/admin/ai/tests/[id]">) {
  await requirePermission("ai.tests");
  const { id } = await params;
  if (!(await aiTestsReady()) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [item] = await db.select().from(aiTestCases).where(eq(aiTestCases.id, id));
  if (!item) notFound();
  const [versions, days, names, results] = await Promise.all([
    caseVersions(id),
    reviewDays(),
    db.select({ id: users.id, n: users.fullName }).from(users),
    db.select().from(aiTestResults).where(eq(aiTestResults.caseId, id)).orderBy(desc(aiTestResults.id)).limit(10),
  ]);
  const name = (u: string | null) => (u ? (names.find((x) => x.id === u)?.n ?? "—") : "—");
  const overdue = new Date().getTime() - item.lastReviewedAt.getTime() > days * 86_400_000;
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{item.question}</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/ai/tests">آزمون دستیار</Link> · {CATEGORY_FA[item.category]} · آخرین بررسی {fmtDateTime(item.lastReviewedAt)} ({name(item.lastReviewedBy)})
            {overdue && (
              <>
                {" "}
                <span className={`${styles.badge} ${styles.badgeWarn}`}>نیاز به بررسی مجدد</span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>ویرایش</h2>
          <ActionForm action={saveCaseAction} submitLabel="ذخیره">
            <CaseFields item={item} />
          </ActionForm>
          <form action={reviewCaseAction} style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={item.id} />
            <button type="submit" className={styles.btnGhost}>
              بررسی شد، درست است (بدون تغییر متن)
            </button>
          </form>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>آخرین نتیجه‌ها</h2>
          {results.map((r) => (
            <div key={r.id} className={styles.batch}>
              <div className={styles.muted} style={{ fontSize: 12 }}>
                <Link href={`/admin/ai/tests/runs/${r.runId}`}>{fmtDateTime(r.createdAt)}</Link> · {PATH_FA[r.path ?? ""] ?? r.status}
                {r.status === "done" && ` · ${r.autoPass ? "✓ قبول" : "✗ رد"}`}
                {r.verdict && ` · انسان: ${r.verdict === "correct" ? "درست" : "اشتباه"}`}
              </div>
              {r.answer && <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{r.answer}</div>}
            </div>
          ))}
          {!results.length && <p className={styles.muted}>هنوز اجرا نشده.</p>}
          <h2 className={styles.cardTitle} style={{ marginTop: 16 }}>
            تاریخچه‌ی تغییرات ({fmtNum(versions.length)})
          </h2>
          {versions.map((v) => (
            <div key={v.id} className={styles.batch}>
              <div className={styles.muted} style={{ fontSize: 12 }}>
                {fmtDateTime(v.createdAt)} · {name(v.changedBy)} · {v.status === "active" ? "فعال" : "پیش‌نویس"} · {CATEGORY_FA[v.category] ?? v.category}
              </div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{v.question}</div>
              {v.expectedAnswer && <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{v.expectedAnswer}</div>}
              <div className={`${styles.muted} ${styles.ltr}`} style={{ fontSize: 12 }}>
                {JSON.stringify(v.expect)}
              </div>
            </div>
          ))}
          {!versions.length && <p className={styles.muted}>هنوز تغییری ثبت نشده (سؤال اولیه از seed).</p>}
        </div>
      </div>
    </>
  );
}
