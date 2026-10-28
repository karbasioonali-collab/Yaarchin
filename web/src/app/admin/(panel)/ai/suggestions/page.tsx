import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { aiSuggestions } from "@/db/schema";
import { SUGGESTION_FA, SUGGESTION_KINDS, type SuggestionKind } from "@/lib/ai/learn";
import { testMode } from "@/lib/ai/tests";
import { can, requireAnyPermission } from "@/lib/auth/can";
import { aiTestsReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import styles from "../../panel.module.css";
import { dismissSuggestionAction, suggestionToKbAction, suggestionToTestAction, trickyAction } from "./actions";

export const metadata: Metadata = { title: "پیشنهاد سؤال تازه" };

const STATUS_FA: Record<string, string> = { kb: "به پایگاه دانش رفت", test: "به آزمون رفت", dismissed: "رد شد" };

// «پیشنهاد سؤال تازه» (ai.knowledge یا ai.tests). docs/infoyaarchin.md بخش ۳۳.
export default async function SuggestionsPage({ searchParams }: PageProps<"/admin/ai/suggestions">) {
  const a = await requireAnyPermission(["ai.knowledge", "ai.tests"]);
  if (!(await aiTestsReady())) return <div className={styles.impersonation}>این بخش بعد از اجرای migration ۰۰۱۱ فعال می‌شود.</div>;
  const sp = await searchParams;
  const view = sp.view === "handled" ? "handled" : "open";
  const kind = (SUGGESTION_KINDS as readonly string[]).includes(String(sp.kind)) ? (String(sp.kind) as SuggestionKind) : null;
  const conds: SQL[] = [view === "open" ? eq(aiSuggestions.status, "open") : ne(aiSuggestions.status, "open")];
  if (kind) conds.push(eq(aiSuggestions.kind, kind));
  const [rows, counts, canKb, canTests] = await Promise.all([
    db
      .select()
      .from(aiSuggestions)
      .where(and(...conds))
      .orderBy(desc(aiSuggestions.lastSeenAt))
      .limit(300),
    db
      .select({ kind: aiSuggestions.kind, n: sql<number>`count(*)::int` })
      .from(aiSuggestions)
      .where(eq(aiSuggestions.status, "open"))
      .groupBy(aiSuggestions.kind),
    can(a.user, "ai.knowledge"),
    can(a.user, "ai.tests"),
  ]);
  const n = (k: string) => counts.find((c) => c.kind === k)?.n ?? 0;
  const total = counts.reduce((s, c) => s + c.n, 0);
  const tab = (href: string, label: string, active: boolean) => (
    <Link key={href} href={href} className={`${styles.tab} ${active ? styles.tabActive : ""}`}>
      {label}
    </Link>
  );
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>پیشنهاد سؤال تازه</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/ai">دستیار هوشمند</Link> · سؤال‌هایی از چت‌های واقعی که دستیار جواب نداد، ارجاع داد، 👎 گرفت یا اشتباه جواب داد. هیچ‌چیز خودکار اضافه نمی‌شود؛ با یک
            کلیک به پایگاه دانش (پیش‌نویس؛ جواب را شما می‌نویسید) یا آزمون ببرید، یا رد کنید.
          </p>
        </div>
      </div>
      <nav className={styles.tabs} aria-label="فیلتر">
        {tab("?", `باز (${fmtNum(total)})`, view === "open" && !kind)}
        {SUGGESTION_KINDS.filter((k) => n(k) > 0 || kind === k).map((k) => tab(`?kind=${k}`, `${SUGGESTION_FA[k]} (${fmtNum(n(k))})`, view === "open" && kind === k))}
        {tab("?view=handled", "رسیدگی‌شده", view === "handled")}
      </nav>
      {canTests && (
        <details className={styles.detailsBox} style={{ marginBottom: 16 }}>
          <summary>پیشنهاد سؤال فریبنده با AI</summary>
          <p className={styles.muted} style={{ fontSize: 13 }}>
            یک درخواست به مدل برای حدود ۵ سؤال فریبنده‌ی تازه (برای کشف اسم کارخانه، سایت خرید، تماس و …). هزینه در سقف آزمون حساب می‌شود (معمولاً کمتر از هزار تومان).
            {testMode() === "test" && " حالت آزمایشی: فهرست ثابت، هزینه صفر."}
          </p>
          <ActionForm action={trickyAction} submitLabel="پیشنهاد بده" />
        </details>
      )}
      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>سؤال</th>
                <th>برچسب</th>
                <th>تعداد</th>
                <th>آخرین بار</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} data-testid="suggestion-row">
                  <td>
                    {s.question}
                    {s.conversationId && (
                      <div>
                        <Link href={`/admin/chats/${s.conversationId}`} style={{ fontSize: 12 }}>
                          گفتگو
                        </Link>
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    <span className={`${styles.badge} ${s.kind === "rule_gap" || s.kind === "leak" ? styles.badgeWarn : ""}`}>
                      {SUGGESTION_FA[s.kind as SuggestionKind] ?? s.kind}
                    </span>
                    {s.detail && (
                      <div className={styles.muted} style={{ fontSize: 12 }}>
                        {s.detail}
                      </div>
                    )}
                  </td>
                  <td>{fmtNum(s.count)}</td>
                  <td style={{ fontSize: 13 }}>
                    {fmtDateTime(s.lastSeenAt)}
                    {s.status !== "open" && <div className={styles.muted}>{STATUS_FA[s.status] ?? s.status}</div>}
                  </td>
                  <td>
                    {s.status === "open" && (
                      <div className={styles.inlineForm}>
                        {canKb && (
                          <form action={suggestionToKbAction}>
                            <input type="hidden" name="id" value={s.id} />
                            <button type="submit" className={styles.btnGhost}>
                              به پایگاه دانش
                            </button>
                          </form>
                        )}
                        {canTests && (
                          <form action={suggestionToTestAction}>
                            <input type="hidden" name="id" value={s.id} />
                            <button type="submit" className={styles.btnGhost}>
                              به آزمون
                            </button>
                          </form>
                        )}
                        <form action={dismissSuggestionAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" className={styles.btnGhost}>
                            رد کردن
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className={styles.muted}>موردی نیست.</p>}
        <p className={styles.muted} style={{ fontSize: 12 }}>
          «قاعده‌ی کد نگرفت» = مدل با دلیلی ارجاع داد که قاعده‌ی کد هم پوشش می‌دهد (کارخانه، پیش‌فاکتور، تخفیف، …)؛ یعنی این شکل پرسیدن باید به قاعده‌ی کد (rules.ts) اضافه شود تا
          بدون هزینه‌ی مدل ارجاع شود.
        </p>
      </div>
    </>
  );
}
