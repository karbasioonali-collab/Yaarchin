import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { kbItems } from "@/db/schema";
import { reviewDays } from "@/lib/ai/kb";
import { requirePermission } from "@/lib/auth/can";
import { aiReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import styles from "../../panel.module.css";
import { reviewKbAction, saveKbAction } from "../actions";
import { KbFields } from "./KbFields";

export const metadata: Metadata = { title: "پایگاه دانش" };

// پایگاه دانش دستیار (ai.knowledge). فیلتر: وضعیت، «نیاز به بررسی مجدد»، جستجو. docs/infoyaarchin.md بخش ۲۹.
export default async function KnowledgePage({ searchParams }: PageProps<"/admin/ai/knowledge">) {
  await requirePermission("ai.knowledge");
  if (!(await aiReady())) return <div className={styles.impersonation}>پایگاه دانش بعد از اجرای migration ۰۰۱۰ فعال می‌شود.</div>;
  const sp = await searchParams;
  const filter = sp.filter === "overdue" || sp.filter === "active" || sp.filter === "draft" ? sp.filter : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const days = await reviewDays();
  const overdue = sql`${kbItems.lastReviewedAt} < now() - make_interval(days => ${days})`;
  const conds: SQL[] = [];
  if (filter === "overdue") conds.push(overdue);
  if (filter === "active" || filter === "draft") conds.push(eq(kbItems.status, filter));
  if (q) conds.push(or(ilike(kbItems.question, `%${q}%`), ilike(kbItems.answer, `%${q}%`))!);
  const [rows, [counts]] = await Promise.all([
    db
      .select({ item: kbItems, overdue: sql<boolean>`${overdue}` })
      .from(kbItems)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(sql`${overdue}`), asc(kbItems.status), desc(kbItems.updatedAt))
      .limit(300),
    db
      .select({
        all: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${kbItems.status} = 'active')::int`,
        overdue: sql<number>`count(*) filter (where ${lt(kbItems.lastReviewedAt, sql`now() - make_interval(days => ${days})`)})::int`,
      })
      .from(kbItems),
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
          <h1 className={styles.pageTitle}>پایگاه دانش دستیار</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/ai">دستیار هوشمند</Link> · فقط موردهای «فعال» به دستیار داده می‌شوند. هر مورد هر {fmtNum(days)} روز یک بار بررسی شود.
          </p>
        </div>
      </div>
      <nav className={styles.tabs} aria-label="فیلتر">
        {tab("", "همه", counts.all)}
        {tab("active", "فعال", counts.active)}
        {tab("draft", "پیش‌نویس", counts.all - counts.active)}
        {tab("overdue", "نیاز به بررسی مجدد", counts.overdue)}
      </nav>
      <div className={styles.card}>
        <form method="get" className={styles.toolbar}>
          {filter && <input type="hidden" name="filter" value={filter} />}
          <input name="q" defaultValue={q} placeholder="جستجو در سؤال و جواب" />
          <button type="submit" className={styles.btnGhost}>
            جستجو
          </button>
        </form>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>سؤال</th>
                <th>وضعیت</th>
                <th>آخرین بررسی</th>
                <th>آخرین ویرایش</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item: k, overdue: od }) => (
                <tr key={k.id}>
                  <td>
                    <Link href={`/admin/ai/knowledge/${k.id}`}>{k.question}</Link>
                    {k.category && (
                      <div className={styles.muted} style={{ fontSize: 12 }}>
                        {k.category}
                      </div>
                    )}
                  </td>
                  <td>{k.status === "active" ? <span className={styles.badge}>فعال</span> : <span className={`${styles.badge} ${styles.badgeMuted}`}>پیش‌نویس</span>}</td>
                  <td style={{ fontSize: 13 }}>
                    {fmtDateTime(k.lastReviewedAt)}
                    {od && (
                      <div>
                        <span className={`${styles.badge} ${styles.badgeWarn}`}>نیاز به بررسی مجدد</span>
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>{fmtDateTime(k.updatedAt)}</td>
                  <td>
                    <form action={reviewKbAction}>
                      <input type="hidden" name="id" value={k.id} />
                      <button type="submit" className={styles.btnGhost}>
                        بررسی شد، درست است
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className={styles.muted}>موردی نیست.</p>}
      </div>
      <details className={styles.detailsBox} style={{ marginTop: 16 }}>
        <summary>+ مورد تازه</summary>
        <ActionForm action={saveKbAction} submitLabel="ذخیره">
          <KbFields />
        </ActionForm>
      </details>
    </>
  );
}
