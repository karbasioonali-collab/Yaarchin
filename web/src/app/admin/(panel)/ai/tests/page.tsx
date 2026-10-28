import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { aiTestCases, aiTestRuns } from "@/db/schema";
import { reviewDays } from "@/lib/ai/kb";
import { caseOverdueSql } from "@/lib/ai/test-cases";
import { SCOPE_FA, staleWarning, testMode } from "@/lib/ai/tests";
import { requirePermission } from "@/lib/auth/can";
import { aiTestsReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import styles from "../../panel.module.css";
import { reviewCaseAction, saveCaseAction } from "./actions";
import { CaseFields } from "./CaseFields";
import { CATEGORY_FA, RUN_STATUS_FA } from "./labels";

export const metadata: Metadata = { title: "آزمون دستیار" };

const FILTERS = ["active", "draft", "normal", "tricky", "handoff", "overdue"] as const;

// سؤال‌های آزمون دستیار، انتخاب دامنه‌ی اجرا (← صفحه‌ی تأیید با هزینه‌ی تخمینی) و اجراهای اخیر (ai.tests). docs/infoyaarchin.md بخش ۳۳.
export default async function TestsPage({ searchParams }: PageProps<"/admin/ai/tests">) {
  await requirePermission("ai.tests");
  if (!(await aiTestsReady())) return <div className={styles.impersonation}>آزمون دستیار بعد از اجرای migration ۰۰۱۱ فعال می‌شود (npm run db:migrate و بعد npm run db:seed).</div>;
  const sp = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(String(sp.filter)) ? String(sp.filter) : "";
  const days = await reviewDays();
  const overdue = caseOverdueSql(days);
  const conds: SQL[] = [];
  if (filter === "active" || filter === "draft") conds.push(eq(aiTestCases.status, filter));
  if (filter === "normal" || filter === "tricky" || filter === "handoff") conds.push(eq(aiTestCases.category, filter));
  if (filter === "overdue") conds.push(overdue);
  const last = (col: string) => sql.raw(`(select r.${col} from ai_test_results r where r.case_id = ai_test_cases.id and r.status = 'done' order by r.id desc limit 1)`);
  const [rows, [counts], runs, warn] = await Promise.all([
    db
      .select({ c: aiTestCases, overdue: sql<boolean>`${overdue}`, lastPass: sql<boolean | null>`${last("auto_pass")}`, lastVerdict: sql<string | null>`${last("verdict")}` })
      .from(aiTestCases)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(aiTestCases.status), asc(aiTestCases.category), asc(aiTestCases.createdAt))
      .limit(500),
    db
      .select({
        all: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${aiTestCases.status} = 'active')::int`,
        overdue: sql<number>`count(*) filter (where ${overdue})::int`,
      })
      .from(aiTestCases),
    db.select().from(aiTestRuns).orderBy(desc(aiTestRuns.startedAt)).limit(10),
    staleWarning(),
  ]);
  const tab = (k: string, label: string, n?: number) => (
    <Link key={k} href={k ? `?filter=${k}` : "?"} className={`${styles.tab} ${filter === k ? styles.tabActive : ""}`}>
      {label}
      {n !== undefined ? ` (${fmtNum(n)})` : ""}
    </Link>
  );
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>آزمون دستیار</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/ai">دستیار هوشمند</Link> · <Link href="/admin/ai/suggestions">پیشنهاد سؤال تازه</Link> · سؤال‌ها از همان مسیر چت (جواب آماده، قاعده‌ی کد، مدل، محافظ)
            پرسیده می‌شوند؛ گفتگو، پیام یا برچسبی ساخته نمی‌شود. {testMode() === "live" ? "با مدل واقعی (هزینه دارد)." : "حالت آزمایشی: مدل ساختگی، هزینه صفر."}
          </p>
        </div>
      </div>
      {warn && (
        <p className={styles.notice}>
          ⚠{" "}
          {warn.kind === "never"
            ? "هنوز آزمون کامل («همه») اجرا نشده."
            : warn.kind === "changed"
              ? "مدل یا دستورالعمل دستیار بعد از آخرین آزمون کامل عوض شده؛ یک بار «همه» را اجرا کنید."
              : `آخرین آزمون کامل بیش از ${fmtNum(warn.days)} روز پیش بود (${fmtDateTime(warn.last)}).`}
        </p>
      )}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>اجرای آزمون</h2>
        <form id="runForm" method="get" action="/admin/ai/tests/confirm" className={styles.toolbar}>
          {(Object.keys(SCOPE_FA) as (keyof typeof SCOPE_FA)[]).map((k) => (
            <label key={k} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <input type="radio" name="scope" value={k} defaultChecked={k === "all"} /> {SCOPE_FA[k]}
            </label>
          ))}
          <button type="submit" className={styles.btn}>
            ادامه (دیدن تعداد و هزینه‌ی تخمینی)
          </button>
        </form>
        <p className={styles.muted} style={{ fontSize: 13, margin: "6px 0 0" }}>
          برای «انتخاب دستی» سؤال‌ها را در جدول پایین تیک بزنید (اگر سؤالی تیک بخورد، فقط همان‌ها اجرا می‌شوند). قبل از اجرا تعداد، سؤال‌های رایگان (قاعده‌ی کد) و هزینه‌ی تخمینی را
          می‌بینید.
        </p>
      </div>

      <nav className={styles.tabs} aria-label="فیلتر" style={{ marginTop: 16 }}>
        {tab("", "همه", counts.all)}
        {tab("active", "فعال", counts.active)}
        {tab("draft", "پیش‌نویس", counts.all - counts.active)}
        {tab("normal", "معمولی")}
        {tab("tricky", "فریبنده")}
        {tab("handoff", "ارجاع")}
        {tab("overdue", "نیاز به بررسی مجدد", counts.overdue)}
      </nav>
      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th></th>
                <th>سؤال</th>
                <th>دسته</th>
                <th>آخرین نتیجه</th>
                <th>آخرین بررسی</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, overdue: od, lastPass, lastVerdict }) => (
                <tr key={c.id}>
                  <td>
                    <input type="checkbox" name="ids" value={c.id} form="runForm" aria-label="انتخاب برای اجرا" />
                  </td>
                  <td>
                    <Link href={`/admin/ai/tests/${c.id}`}>{c.question}</Link>
                    {c.productSlug && (
                      <div className={`${styles.muted} ${styles.ltr}`} style={{ fontSize: 12 }}>
                        {c.productSlug}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {CATEGORY_FA[c.category]}
                    {c.status === "draft" && <span className={`${styles.badge} ${styles.badgeMuted}`}>پیش‌نویس</span>}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {lastVerdict ? (lastVerdict === "correct" ? "درست (انسان)" : "اشتباه (انسان)") : lastPass === null ? "—" : lastPass ? "✓ قبول" : "✗ رد"}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {fmtDateTime(c.lastReviewedAt)}
                    {od && (
                      <div>
                        <span className={`${styles.badge} ${styles.badgeWarn}`}>نیاز به بررسی مجدد</span>
                      </div>
                    )}
                  </td>
                  <td>
                    <form action={reviewCaseAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className={styles.btnGhost}>
                        بررسی شد
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className={styles.muted}>سؤالی نیست.</p>}
      </div>

      <details className={styles.detailsBox} style={{ marginTop: 16 }}>
        <summary>+ سؤال تازه</summary>
        <ActionForm action={saveCaseAction} submitLabel="ذخیره">
          <CaseFields />
        </ActionForm>
      </details>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <h2 className={styles.cardTitle}>اجراهای اخیر</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>زمان</th>
                <th>دامنه</th>
                <th>وضعیت</th>
                <th>نتیجه</th>
                <th>هزینه</th>
                <th>مدل</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: 13 }}>
                    <Link href={`/admin/ai/tests/runs/${r.id}`}>{fmtDateTime(r.startedAt)}</Link>
                  </td>
                  <td style={{ fontSize: 13 }}>{SCOPE_FA[(r.scope as { kind?: keyof typeof SCOPE_FA }).kind ?? "all"] ?? "—"}</td>
                  <td style={{ fontSize: 13 }}>
                    {RUN_STATUS_FA[r.status] ?? r.status}
                    {r.mode === "test" && <span className={`${styles.badge} ${styles.badgeWarn}`}>آزمایشی</span>}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {fmtNum(r.passed)} قبول · {fmtNum(r.failed)} رد{r.skipped ? ` · ${fmtNum(r.skipped)} ردشده بدون اجرا` : ""} از {fmtNum(r.total)}
                  </td>
                  <td>{fmtNum(Math.round(Number(r.costToman)))}</td>
                  <td className={styles.ltr} style={{ fontSize: 12 }}>
                    {r.model} · {r.promptVersion}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!runs.length && <p className={styles.muted}>هنوز اجرایی نیست.</p>}
      </div>
    </>
  );
}
