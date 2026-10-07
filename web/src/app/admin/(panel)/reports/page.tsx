import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JalaliDateInput } from "@/components/admin/JalaliDateInput";
import { can, requirePermission } from "@/lib/auth/can";
import { reportsReady } from "@/lib/db-ready";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { scoreSource } from "@/lib/leads/score";
import { delta, PRESET_FA, type Preset, resolveRange } from "@/lib/reports/range";
import { aiStats, chatNow, counts, fmtDuration, newCustomers, staffPerformance, topCategories, topFavorited, topProducts } from "@/lib/reports/report";
import { isEnabled } from "@/lib/settings";
import { tehranDayStart } from "@/lib/tehran-time";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import styles from "../panel.module.css";
import r from "./reports.module.css";

export const metadata: Metadata = { title: "گزارش‌ها" };

// گزارش روزانه در پنل (بدون پیامک یا ایمیل). روزها به وقت تهران. docs/infoyaarchin.md بخش ۲۸.
// دسترسی: reports.view؛ بخش «عملکرد کارشناس‌ها» جدا با reports.staff. سوئیچ features.reports کل بخش را خاموش می‌کند.
function Kpi({ title, cur, prev, prevSpan }: { title: string; cur: number; prev: number; prevSpan: string }) {
  const d = delta(cur, prev);
  return (
    <div className={r.kpi}>
      <span className={r.kpiLabel}>{title}</span>
      <span className={r.kpiValue}>{fmtNum(cur)}</span>
      <span className={d.dir === "up" ? r.up : d.dir === "down" ? r.down : r.flat} title={`بازه‌ی قبل: ${prevSpan}`}>
        {d.text} <span className={r.prev}>(قبل: {fmtNum(prev)})</span>
      </span>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const a = await requirePermission("reports.view");
  if (!(await isEnabled("reports"))) notFound();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const range = resolveRange({ range: one(sp.range), from: one(sp.from), to: one(sp.to) });
  const cur = { start: range.start, end: range.end };
  const prev = { start: range.prev.start, end: range.prev.end };
  const [seeStaff, leadsOn] = await Promise.all([can(a.user, "reports.staff"), reportsReady()]);

  const [c, p, prods, cats, signups, favs, chats, staff, ai, leads] = await Promise.all([
    counts(cur),
    counts(prev),
    topProducts(cur),
    topCategories(cur),
    newCustomers(cur),
    topFavorited(cur),
    chatNow(),
    seeStaff ? staffPerformance(cur) : Promise.resolve([]),
    aiStats(cur),
    leadsOn
      ? scoreSource().then(
          async ({ sql: src }) =>
            (
              await db.execute<{ user_id: string; score: string; full_name: string }>(
                sql`select s.user_id, s.score, u.full_name from ${src} s join users u on u.id = s.user_id where s.score > 0 order by s.score desc, u.created_at desc limit 10`,
              )
            ).rows,
        )
      : Promise.resolve([]),
  ]);

  const label = (d: string) => fmtDate(tehranDayStart(d));
  const span = range.from === range.to ? label(range.from) : `${label(range.from)} تا ${label(range.to)}`;
  const prevSpan = range.prev.from === range.prev.to ? label(range.prev.from) : `${label(range.prev.from)} تا ${label(range.prev.to)}`;
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>گزارش‌ها</h1>
          <p className={styles.pageSub}>
            {PRESET_FA[range.preset]}: {span} · مقایسه با {prevSpan} · روزها به وقت تهران
          </p>
        </div>
      </div>

      <div className={r.range}>
        <nav className={styles.tabs} aria-label="بازه">
          {(["today", "yesterday", "7d", "30d"] as Preset[]).map((k) => (
            <Link key={k} href={`?range=${k}`} className={`${styles.tab} ${range.preset === k ? styles.tabActive : ""}`}>
              {PRESET_FA[k]}
            </Link>
          ))}
        </nav>
        <form method="get" className={r.custom}>
          <input type="hidden" name="range" value="custom" />
          <span className={styles.muted}>از</span>
          <JalaliDateInput name="from" defaultValue={range.preset === "custom" ? range.from : ""} ariaLabel="از تاریخ" inline required />
          <span className={styles.muted}>تا</span>
          <JalaliDateInput name="to" defaultValue={range.preset === "custom" ? range.to : ""} ariaLabel="تا تاریخ" inline required />
          <button type="submit" className={styles.btnGhost}>
            نمایش
          </button>
        </form>
      </div>
      {range.error && (
        <div className={styles.impersonation}>
          {range.error} ({PRESET_FA["7d"]} نمایش داده شد.)
        </div>
      )}

      <div className={r.kpis}>
        <Kpi title="بازدید محصول" cur={c.productViews} prev={p.productViews} prevSpan={prevSpan} />
        <Kpi title="بازدیدکننده‌ی یکتا (مشتری واردشده)" cur={c.visitors} prev={p.visitors} prevSpan={prevSpan} />
        <Kpi title="ثبت‌نام تازه" cur={c.signups} prev={p.signups} prevSpan={prevSpan} />
        <Kpi title="افزودن به علاقه‌مندی" cur={c.favoriteAdds} prev={p.favoriteAdds} prevSpan={prevSpan} />
        <Kpi title="گفتگوی تازه" cur={c.newChats} prev={p.newChats} prevSpan={prevSpan} />
        <Kpi title="درخواست مشتری" cur={c.inquiries} prev={p.inquiries} prevSpan={prevSpan} />
      </div>

      <div className={r.cols}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>پربازدیدترین محصولات</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>محصول</th>
                <th>بازدید</th>
                <th>بازدیدکننده</th>
              </tr>
            </thead>
            <tbody>
              {prods.map((x) => (
                <tr key={x.id}>
                  <td>
                    <Link href={`/admin/products/${x.id}`}>{x.title}</Link>
                  </td>
                  <td>{fmtNum(x.views)}</td>
                  <td>{fmtNum(x.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!prods.length && <p className={styles.muted}>بازدیدی در این بازه ثبت نشده.</p>}
        </section>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>پربازدیدترین دسته‌ها</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>دسته</th>
                <th>بازدید</th>
                <th>بازدیدکننده</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((x) => (
                <tr key={x.id}>
                  <td>
                    <Link href={`/admin/categories/${x.id}`}>{x.name}</Link>
                  </td>
                  <td>{fmtNum(x.views)}</td>
                  <td>{fmtNum(x.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!cats.length && <p className={styles.muted}>بازدیدی در این بازه ثبت نشده.</p>}
          <p className={styles.muted} style={{ fontSize: 12 }}>
            بازدید فقط برای مشتری واردشده ثبت می‌شود؛ بازدید مهمان‌ها شمرده نمی‌شود.
          </p>
        </section>
      </div>

      <div className={r.cols}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>مشتری‌های تازه ({fmtNum(c.signups)})</h2>
          <table className={styles.table}>
            <tbody>
              {signups.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/customers/${u.id}`}>{u.full_name}</Link>
                    <div className={`${styles.muted} ${styles.ltr}`} style={{ fontSize: 12 }}>
                      {u.mobile ?? u.email ?? ""}
                    </div>
                  </td>
                  <td className={styles.muted}>{fmtDateTime(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!signups.length && <p className={styles.muted}>ثبت‌نامی در این بازه نبود.</p>}
        </section>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>بیشترین علاقه‌مندی</h2>
          <table className={styles.table}>
            <tbody>
              {favs.map((x) => (
                <tr key={x.id}>
                  <td>
                    <Link href={`/admin/products/${x.id}`}>{x.title}</Link>
                  </td>
                  <td>{fmtNum(x.adds)} بار</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!favs.length && <p className={styles.muted}>علاقه‌مندی تازه‌ای در این بازه نبود.</p>}
        </section>
      </div>

      <section className={styles.card} style={{ marginBottom: 16 }}>
        <h2 className={styles.cardTitle}>گفتگوها (وضعیت همین حالا)</h2>
        <div className={r.kpis}>
          <div className={r.kpi}>
            <span className={r.kpiLabel}>بی‌پاسخ (آخرین پیام از مشتری)</span>
            <span className={r.kpiValue}>{fmtNum(chats.unansweredCount)}</span>
          </div>
          <div className={r.kpi}>
            <span className={r.kpiLabel}>باز و ارجاع‌نشده</span>
            <span className={r.kpiValue}>{fmtNum(chats.unassigned)}</span>
            <Link href="/admin/chats?tab=unassigned" style={{ fontSize: 12 }}>
              صف ارجاع‌نشده
            </Link>
          </div>
        </div>
        {chats.unanswered.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>مشتری</th>
                <th>منتظر از</th>
                <th>کارشناس</th>
              </tr>
            </thead>
            <tbody>
              {chats.unanswered.map((x) => (
                <tr key={x.id}>
                  <td>
                    <Link href={`/admin/chats/${x.id}`}>{x.customer}</Link>
                  </td>
                  <td className={styles.muted}>{fmtDateTime(x.since)}</td>
                  <td>{x.assignee ?? <span className={`${styles.badge} ${styles.badgeWarn}`}>ارجاع‌نشده</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {seeStaff && (
        <section className={styles.card} style={{ marginBottom: 16 }}>
          <h2 className={styles.cardTitle}>عملکرد کارشناس‌ها</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>کارشناس</th>
                  <th>ارجاع‌گرفته</th>
                  <th>پیام پاسخ</th>
                  <th>میانگین زمان اولین پاسخ</th>
                  <th>نرخ تبدیل</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((x) => (
                  <tr key={x.id}>
                    <td>{x.name}</td>
                    <td>{fmtNum(x.assigned)}</td>
                    <td>{fmtNum(x.replies)}</td>
                    <td>
                      {fmtDuration(x.avgFirstSec)}
                      {x.firstCount > 0 && <span className={styles.muted}> ({fmtNum(x.firstCount)} گفتگو)</span>}
                    </td>
                    <td>{x.conversion === null ? "—" : `${fmtNum(x.conversion)}٪ (${fmtNum(x.withInquiry)} از ${fmtNum(x.assigned)})`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!staff.length && <p className={styles.muted}>فعالیتی در این بازه نبود.</p>}
          <p className={styles.muted} style={{ fontSize: 12 }}>
            نرخ تبدیل: از گفتگوهایی که در این بازه به کارشناس ارجاع شد، درصدی که از آن‌ها «درخواست مشتری» ساخته شده. اولین پاسخ: از اولین پیام مشتری تا اولین پاسخ کارشناس.
          </p>
        </section>
      )}

      <div className={r.cols}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>مشتری‌های با امتیاز بالا</h2>
          {leadsOn ? (
            <>
              <table className={styles.table}>
                <tbody>
                  {leads.map((x) => (
                    <tr key={x.user_id}>
                      <td>
                        <Link href={`/admin/customers/${x.user_id}`}>{x.full_name}</Link>
                      </td>
                      <td>
                        <span className={styles.badge}>{fmtNum(Number(x.score))}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!leads.length && <p className={styles.muted}>هنوز مشتری‌ای امتیاز نگرفته.</p>}
              <p style={{ fontSize: 13 }}>
                <Link href="/admin/customers?sort=score">همه‌ی مشتری‌ها به ترتیب امتیاز</Link> · <Link href="/admin/reports/scoring">قانون‌های امتیاز جدیت</Link>
              </p>
            </>
          ) : (
            <p className={styles.muted}>امتیاز جدیت بعد از اجرای migration ۰۰۰۹ فعال می‌شود.</p>
          )}
        </section>
        <section className={`${styles.card} ${r.soon}`}>
          <h2 className={styles.cardTitle}>تحلیل هوشمند</h2>
          <p className={styles.muted}>بعد از راه‌اندازی هوش مصنوعی فعال می‌شود.</p>
          <div className={r.kpis} style={{ marginBottom: 0 }}>
            <div className={r.kpi}>
              <span className={r.kpiLabel}>جواب خودکار AI</span>
              <span className={r.kpiValue}>{ai.autoReplyPct === null ? "—" : `${fmtNum(ai.autoReplyPct)}٪`}</span>
            </div>
            <div className={r.kpi}>
              <span className={r.kpiLabel}>ارجاع به کارشناس</span>
              <span className={r.kpiValue}>{ai.referralPct === null ? "—" : `${fmtNum(ai.referralPct)}٪`}</span>
            </div>
            <div className={r.kpi}>
              <span className={r.kpiLabel}>👎 بازخورد منفی</span>
              <span className={r.kpiValue}>{ai.thumbsDown === null ? "—" : fmtNum(ai.thumbsDown)}</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
