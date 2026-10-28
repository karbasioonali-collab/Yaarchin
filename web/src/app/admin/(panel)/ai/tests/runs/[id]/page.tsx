import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiTestResults, aiTestRuns } from "@/db/schema";
import { HANDOFF_FA } from "@/lib/ai/rules";
import type { Check } from "@/lib/ai/test-checks";
import { SCOPE_FA } from "@/lib/ai/tests";
import { requirePermission } from "@/lib/auth/can";
import { aiTestsReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import styles from "../../../../panel.module.css";
import { stopRunAction, verdictAction } from "../../actions";
import { AutoRefresh } from "../../AutoRefresh";
import { CHECK_FA, PATH_FA, RUN_STATUS_FA, SOURCE_FA } from "../../labels";

export const metadata: Metadata = { title: "اجرای آزمون" };

// پیشرفت زنده، توقف، نتیجه‌ی هر سؤال (جواب دستیار کنار جواب درست، منبع، دلیل ارجاع، بررسی‌های خودکار، هزینه و زمان) و قضاوت انسان.
export default async function RunPage({ params }: PageProps<"/admin/ai/tests/runs/[id]">) {
  await requirePermission("ai.tests");
  const { id } = await params;
  if (!(await aiTestsReady()) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [run] = await db.select().from(aiTestRuns).where(eq(aiTestRuns.id, id));
  if (!run) notFound();
  const results = await db.select().from(aiTestResults).where(eq(aiTestResults.runId, id)).orderBy(asc(aiTestResults.position));
  const running = run.status === "running";
  const handled = run.done + run.skipped;
  return (
    <>
      <AutoRefresh active={running} />
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>اجرای آزمون: {SCOPE_FA[(run.scope as { kind?: keyof typeof SCOPE_FA }).kind ?? "all"]}</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/ai/tests">آزمون دستیار</Link> · {fmtDateTime(run.startedAt)} · <span className={styles.ltr}>{run.model}</span> · دستورالعمل {run.promptVersion}
            {run.mode === "test" && <span className={`${styles.badge} ${styles.badgeWarn}`}>آزمایشی (مدل ساختگی)</span>}
          </p>
        </div>
      </div>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statValue} data-testid="run-status">
            {RUN_STATUS_FA[run.status] ?? run.status}
          </div>
          <div className={styles.statLabel}>
            {fmtNum(handled)} از {fmtNum(run.total)}
            {running && run.stopRequested ? " · توقف درخواست شد" : ""}
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>
            {fmtNum(run.passed)} / {fmtNum(run.failed)}
          </div>
          <div className={styles.statLabel}>قبول / رد{run.skipped ? ` · ${fmtNum(run.skipped)} ردشده بدون اجرا` : ""}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{fmtNum(Math.round(Number(run.costToman)))}</div>
          <div className={styles.statLabel}>هزینه (تومان) · تخمین {fmtNum(Math.round(Number(run.estimatedToman)))}</div>
        </div>
      </div>
      {running && !run.stopRequested && (
        <form action={stopRunAction} style={{ marginBottom: 16 }}>
          <input type="hidden" name="id" value={run.id} />
          <button type="submit" className={styles.btnGhost}>
            توقف
          </button>
        </form>
      )}
      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>سؤال و جواب درست</th>
                <th>جواب دستیار</th>
                <th>بررسی خودکار</th>
                <th>قضاوت</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const checks = (r.checks ?? []) as Check[];
                return (
                  <tr key={r.id} data-testid="result-row">
                    <td style={{ minWidth: 200 }}>
                      <div style={{ fontWeight: 600 }}>{r.question}</div>
                      {r.productSlug && (
                        <div className={`${styles.muted} ${styles.ltr}`} style={{ fontSize: 12 }}>
                          {r.productSlug}
                        </div>
                      )}
                      {r.expectedAnswer && (
                        <div className={styles.muted} style={{ fontSize: 13, marginTop: 4 }}>
                          درست: {r.expectedAnswer}
                        </div>
                      )}
                    </td>
                    <td style={{ minWidth: 220, fontSize: 13 }}>
                      {r.status === "pending" ? (
                        <span className={styles.muted}>در انتظار…</span>
                      ) : (
                        <>
                          <div className={styles.muted} style={{ fontSize: 12 }}>
                            {PATH_FA[r.path ?? ""] ?? r.path}
                            {r.answerSource && ` · منبع: ${SOURCE_FA[r.answerSource] ?? r.answerSource}`}
                            {r.handoffReason && ` · ارجاع: ${HANDOFF_FA[r.handoffReason] ?? r.handoffReason}`}
                          </div>
                          {r.answer && <div style={{ whiteSpace: "pre-wrap" }}>{r.answer}</div>}
                          {r.status === "done" && (
                            <div className={styles.muted} style={{ fontSize: 12 }}>
                              {fmtNum(Math.round(Number(r.costToman)))} تومان · {r.latencyMs !== null ? `${fmtNum(Math.round(r.latencyMs / 100) / 10)} ث` : "—"}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {r.status === "done" && (
                        <>
                          <div style={{ fontWeight: 700 }}>{r.autoPass ? "✓ قبول" : "✗ رد"}</div>
                          {checks.map((c, i) => (
                            <div key={i}>
                              {c.ok ? "✓" : "✗"} {CHECK_FA[c.check] ?? c.check}
                              {c.detail && <span className={styles.muted}> ({c.detail})</span>}
                            </div>
                          ))}
                        </>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {r.status === "done" && (
                        <>
                          {r.verdict && <div style={{ fontWeight: 700 }}>{r.verdict === "correct" ? "درست" : "اشتباه"}</div>}
                          <form action={verdictAction} className={styles.inlineForm}>
                            <input type="hidden" name="resultId" value={r.id} />
                            <button type="submit" name="verdict" value="correct" className={styles.btnGhost}>
                              درست
                            </button>
                            <button type="submit" name="verdict" value="wrong" className={styles.btnGhost}>
                              اشتباه
                            </button>
                          </form>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={styles.muted} style={{ fontSize: 12 }}>
          «اشتباه» سؤال را به <Link href="/admin/ai/suggestions">پیشنهاد سؤال تازه</Link> می‌فرستد تا جوابش در پایگاه دانش یا دستورالعمل درست شود.
        </p>
      </div>
    </>
  );
}
