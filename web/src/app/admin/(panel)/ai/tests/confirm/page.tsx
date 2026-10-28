import type { Metadata } from "next";
import Link from "next/link";
import { aiConfig } from "@/lib/ai/config";
import { casesFor, estimateFor, runningRun, type Scope, type ScopeKind, SCOPE_FA } from "@/lib/ai/tests";
import { ruleCaught } from "@/lib/ai/test-checks";
import { aiLimits } from "@/lib/ai/usage";
import { requirePermission } from "@/lib/auth/can";
import { aiTestsReady } from "@/lib/db-ready";
import { fmtNum } from "@/lib/format";
import styles from "../../../panel.module.css";
import { startRunAction } from "../actions";
import { CATEGORY_FA } from "../labels";

export const metadata: Metadata = { title: "تأیید اجرای آزمون" };

// صفحه‌ی تأیید قبل از اجرا: تعداد، سؤال‌های رایگان (قاعده‌ی کد یا جواب آماده)، هزینه‌ی تخمینی و باقی‌مانده‌ی سقف آزمون. بخش ۳۳.
export default async function ConfirmPage({ searchParams }: PageProps<"/admin/ai/tests/confirm">) {
  await requirePermission("ai.tests");
  if (!(await aiTestsReady())) return <div className={styles.impersonation}>آزمون دستیار بعد از اجرای migration ۰۰۱۱ فعال می‌شود.</div>;
  const sp = await searchParams;
  const ids = [sp.ids ?? []].flat().map(String);
  // اگر سؤالی تیک خورده، فقط همان‌ها
  const kind: ScopeKind = ids.length ? "selected" : String(sp.scope) in SCOPE_FA ? (String(sp.scope) as ScopeKind) : "all";
  const scope: Scope = { kind, ids };
  const [cases, limits, busy] = await Promise.all([casesFor(scope), aiLimits(), runningRun()]);
  const est = await estimateFor(cases);
  const over = est.live && est.toman > est.remainingToman;
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>تأیید اجرای آزمون: {SCOPE_FA[kind]}</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/ai/tests">آزمون دستیار</Link>
          </p>
        </div>
      </div>
      {error && <p className={styles.notice}>{error}</p>}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{fmtNum(est.total)}</div>
          <div className={styles.statLabel}>سؤال</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{fmtNum(est.free)}</div>
          <div className={styles.statLabel}>رایگان (قاعده‌ی کد یا جواب آماده)</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{fmtNum(est.toman)}</div>
          <div className={styles.statLabel}>هزینه‌ی تخمینی (تومان)</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{fmtNum(Math.round(est.remainingToman))}</div>
          <div className={styles.statLabel}>باقی‌مانده‌ی سقف امروز آزمون از {fmtNum(est.capToman)}</div>
        </div>
      </div>
      <div className={styles.card}>
        <p style={{ marginTop: 0, fontSize: 14 }}>
          {est.live ? (
            <>
              مدل <span className={styles.ltr}>{aiConfig().model}</span>. تخمین = {fmtNum(est.model)} سؤالِ مدل × میانگین {fmtNum(Math.round(est.avgToman))} تومان
              {est.avgFromData ? " (۳۰ درخواست زنده‌ی اخیر)" : " (پیش‌فرض؛ هنوز درخواست زنده‌ای نیست)"}. سقف آزمون جدا از سقف چت مشتری است.
            </>
          ) : (
            "حالت آزمایشی (کلید لیارا تعریف نشده): مدل ساختگی، هزینه صفر. فقط مسیرها آزموده می‌شوند، نه کیفیت جواب."
          )}
        </p>
        {over && <p className={styles.notice}>هزینه‌ی تخمینی از باقی‌مانده‌ی سقف امروز آزمون بیشتر است؛ دامنه را کوچک‌تر کنید یا سقف را در صفحه‌ی دستیار بالا ببرید.</p>}
        {busy && <p className={styles.notice}>یک آزمون دیگر در حال اجراست.</p>}
        <form action={startRunAction}>
          <input type="hidden" name="scope" value={kind} />
          {kind === "selected" && cases.map((c) => <input key={c.id} type="hidden" name="ids" value={c.id} />)}
          <button type="submit" className={styles.btn} disabled={!cases.length || over || !!busy}>
            تأیید و اجرا
          </button>{" "}
          <Link href="/admin/ai/tests" className={styles.btnGhost}>
            انصراف
          </Link>
        </form>
      </div>
      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>سؤال</th>
                <th>دسته</th>
                <th>مسیر</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>{c.question}</td>
                  <td style={{ fontSize: 13 }}>{CATEGORY_FA[c.category]}</td>
                  <td style={{ fontSize: 13 }}>{ruleCaught(c.question, limits.bigOrderQty) ? "رایگان" : "مدل"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!cases.length && <p className={styles.muted}>سؤالی در این دامنه نیست.</p>}
      </div>
    </>
  );
}
