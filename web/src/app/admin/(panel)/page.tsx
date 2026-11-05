import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { roles, sessions, userRoles, users } from "@/db/schema";
import { can, canAny, requirePermission } from "@/lib/auth/can";
import { staleWarning } from "@/lib/ai/tests";
import { testLimits } from "@/lib/ai/usage";
import { autoInsightDue, autoInsightHour, autoInsightRange, nextTestDue, sparkPath, waitText, waitTone } from "@/lib/dashboard/core";
import { activeLeads, aiCostCard, chatsWaiting, chatsYesterday, lastFullTest, newCustomersCard, ratesCard, visitsCard } from "@/lib/dashboard/data";
import { aiReady, aiTestsReady } from "@/lib/db-ready";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { scoreTone, SCORE_TONE_STYLE } from "@/lib/leads/score-tone";
import { RATE_PERMS } from "@/lib/pricing/labels";
import { autoInsightToday, insightSettings } from "@/lib/reports/insight";
import { tehranDayStart, tehranYmd } from "@/lib/tehran-time";
import styles from "./panel.module.css";
import d from "./dashboard.module.css";

export const metadata: Metadata = { title: "داشبورد" };

// ---------- آیکون‌ها (SVG داخل صفحه، بدون فایل یا کتابخانه) ----------
const P: Record<string, string> = {
  eye: "M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Zm10.5 3.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z",
  chat: "M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z",
  userPlus: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0M19 8v6M16 11h6",
  star: "m12 2.8 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3 6.3 20.3l1.1-6.3L2.8 9.5l6.4-.9L12 2.8Z",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v10M9 9.5c0-1 1.3-1.8 3-1.8s3 .8 3 1.8-1.3 1.6-3 1.9-3 .9-3 2 1.3 1.8 3 1.8 3-.8 3-1.8",
  chip: "M7 7h10v10H7zM9.5 3v4M14.5 3v4M9.5 17v4M14.5 17v4M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4",
  check: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9 2.8 2.8L16.5 9",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
};
function Icon({ name }: { name: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

type Tone = "green" | "orange" | "red" | "gray";
const TONE: Record<Tone, string> = { green: "", orange: d.toneOrange, red: d.toneRed, gray: d.toneGray };
function Card(p: { title: string; icon: string; tone?: Tone; testid: string; href?: string; hrefLabel?: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`${d.card} ${TONE[p.tone ?? "green"]} ${p.wide ? d.wide : ""}`} data-testid={p.testid}>
      <div className={d.head}>
        <span className={d.icon}>
          <Icon name={p.icon} />
        </span>
        <h2 className={d.title}>{p.title}</h2>
        {p.href && (
          <Link href={p.href} className={d.headLink}>
            {p.hrefLabel ?? "بیشتر"}
          </Link>
        )}
      </div>
      {p.children}
    </section>
  );
}

// نمودار ۷ روز (قدیمی ← امروز؛ در صفحه‌ی راست‌چین هم زمان از چپ به راست، مثل همه‌ی نمودارها)
function Spark({ values, label, orange }: { values: number[]; label: string; orange?: boolean }) {
  const s = sparkPath(values, 120, 32);
  const last = s.points[s.points.length - 1];
  return (
    <svg className={`${d.spark} ${orange ? d.sparkOrange : ""}`} viewBox="0 0 120 32" preserveAspectRatio="none" role="img" aria-label={label} data-testid="spark">
      <title>{label}</title>
      <path className={d.sparkArea} d={s.area} />
      <polyline className={d.sparkLine} points={s.line} />
      {last && <circle className={d.sparkDot} cx={last.x} cy={last.y} r="2.6" />}
    </svg>
  );
}
const sparkLabel = (what: string, days: { ymd: string; total: number }[]) =>
  `${what} ۷ روز اخیر: ` + days.map((x) => `${fmtDate(tehranDayStart(x.ymd))} ${fmtNum(x.total)}`).join("، ");

function Kpi({ label, value, cls }: { label: string; value: number; cls?: string }) {
  return (
    <div className={`${d.kpi} ${cls ?? ""}`}>
      <span className={d.kpiValue}>{fmtNum(value)}</span>
      <span className={d.kpiLabel}>{label}</span>
    </div>
  );
}

export default async function DashboardPage() {
  const a = await requirePermission("dashboard.view");

  // ردیف اول همان قبلی
  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(users);
  const byRole = await db
    .select({ key: roles.key, nameFa: roles.nameFa, n: count(userRoles.userId) })
    .from(roles)
    .leftJoin(userRoles, eq(userRoles.roleId, roles.id))
    .groupBy(roles.id)
    .orderBy(roles.createdAt);
  const [{ activeSessions }] = await db
    .select({ activeSessions: count() })
    .from(sessions)
    .where(and(isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));

  // هر کارت با دسترسی خودش (بخش ۵۱). با auth.enforce_permissions خاموش، can برای همه‌ی کارمندها true است.
  const [seeVisits, seeChatStats, seeChatList, seeCustomers, seeCosts, seeTests, seeInsight, seeActivity, seeSettings] = await Promise.all(
    ["reports.visits", "reports.chats", "chats.view_all", "reports.customers", "ai.costs", "ai.tests", "reports.insight", "activity.view", "settings.manage"].map((k) =>
      can(a.user, k),
    ),
  );
  const seeRates = await canAny(a.user, RATE_PERMS);
  const aiOn = await aiReady();
  const testsOn = seeTests && (await aiTestsReady());

  const [visits, chatDay, waiting, newCust, leads, rates, cost, tests, testWarn, tl, insSet, auto] = await Promise.all([
    seeVisits ? visitsCard() : null,
    seeChatStats ? chatsYesterday() : null,
    seeChatList ? chatsWaiting(8) : null,
    seeCustomers ? newCustomersCard() : null,
    seeCustomers ? activeLeads(5) : null,
    seeRates ? ratesCard() : null,
    seeCosts ? aiCostCard() : null,
    testsOn ? lastFullTest() : null,
    testsOn ? staleWarning() : null,
    testsOn ? testLimits() : null,
    seeInsight && aiOn ? insightSettings() : null,
    seeInsight && aiOn ? autoInsightToday() : null,
  ]);
  const now = new Date();
  const today = tehranYmd(now);
  const autoRange = autoInsightRange(now);
  const label = (ymd: string) => fmtDate(tehranDayStart(ymd));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>سلام {a.user.fullName.split(" ")[0]} 👋</h1>
          <p className={styles.pageSub}>خلاصه‌ی وضعیت یارچین · {fmtDate(now)}</p>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{fmtNum(totalUsers)}</div>
          <div className={styles.statLabel}>کل کاربران</div>
        </div>
        {byRole
          .filter((r) => r.key !== "company")
          .map((r) => (
            <div key={r.key} className={styles.stat}>
              <div className={styles.statValue}>{fmtNum(r.n)}</div>
              <div className={styles.statLabel}>{r.nameFa}</div>
            </div>
          ))}
        <div className={styles.stat}>
          <div className={styles.statValue}>{fmtNum(activeSessions)}</div>
          <div className={styles.statLabel}>نشست فعال</div>
        </div>
      </div>

      <div className={d.grid}>
        {visits && (
          <Card title="بازدید سایت" icon="eye" testid="dash-visits" href="/admin/reports?range=7d" hrefLabel="گزارش‌ها">
            <div className={d.row}>
              <div>
                <div className={d.big} data-testid="visits-24h">
                  {fmtNum(visits.last24.total)}
                </div>
                <div className={d.sub}>ورود به سایت در ۲۴ ساعت گذشته (هر نفر روزی یک بار)</div>
              </div>
              <Spark values={visits.days.map((x) => x.total)} label={sparkLabel("ورود به سایت", visits.days)} />
            </div>
            <div className={d.split} data-testid="visits-split">
              <span>
                مهمان <b>{fmtNum(visits.last24.guest)}</b>
              </span>
              <span>
                مشتری <b>{fmtNum(visits.last24.total - visits.last24.guest)}</b>
              </span>
            </div>
            <div className={d.split} data-testid="visits-all">
              <span className={d.sub}>کل زمان:</span>
              <span>
                <b>{fmtNum(visits.all.total)}</b> (مهمان {fmtNum(visits.all.guest)} · مشتری {fmtNum(visits.all.total - visits.all.guest)})
              </span>
            </div>
            <p className={d.note} data-testid="guest-since">
              {visits.guestSince ? `بازدید مهمان‌ها از ${fmtDate(visits.guestSince)} شمرده می‌شود؛ قبل از آن فقط مشتری‌های واردشده.` : "هنوز هیچ بازدید مهمانی ثبت نشده است."}
            </p>
          </Card>
        )}

        {(chatDay || waiting) && (
          <Card
            title="گفتگوها"
            icon="chat"
            tone={waiting && waiting.list.some((w) => waitTone(w.since, now) === "late") ? "red" : waiting && waiting.count > 0 ? "orange" : "green"}
            testid="dash-chats"
            href="/admin/chats"
            hrefLabel="همه‌ی گفتگوها"
          >
            {chatDay && (
              <>
                <div className={d.row} style={{ marginBottom: 8 }}>
                  <span className={d.sub}>دیروز ({label(chatDay.days[5]?.ymd ?? today)})</span>
                  <Spark values={chatDay.days.map((x) => x.total)} label={sparkLabel("گفتگوهای فعال", chatDay.days)} orange />
                </div>
                <div className={d.kpis} data-testid="chats-yesterday">
                  <Kpi label="کل" value={chatDay.day.total} />
                  <Kpi label="پاسخ دستیار" value={chatDay.day.ai} cls={d.kpiAi} />
                  <Kpi label="پاسخ کارشناس" value={chatDay.day.staff} cls={d.kpiStaff} />
                  <Kpi label="بی‌پاسخ" value={chatDay.day.unanswered} cls={chatDay.day.unanswered ? d.kpiBad : ""} />
                </div>
                <p className={d.note}>
                  «کل» گفتگوهایی است که مشتری دیروز در آن‌ها پیام داد. گفتگویی که هم دستیار و هم کارشناس جوابش را دادند، در هر دو شمرده می‌شود. «بی‌پاسخ» یعنی تا پایان دیروز جوابی
                  نگرفت.
                </p>
              </>
            )}
            {waiting && (
              <>
                <h3 className={d.subTitle} data-testid="waiting-count">
                  الان منتظر جواب: {fmtNum(waiting.count)}
                </h3>
                {waiting.list.length === 0 ? (
                  <p className={d.sub} style={{ margin: 0 }}>
                    گفتگوی بی‌جوابی نیست.
                  </p>
                ) : (
                  <ul className={d.list} data-testid="waiting-list">
                    {waiting.list.map((w) => {
                      const tone = waitTone(w.since, now);
                      return (
                        <li key={w.id} data-tone={tone}>
                          <Link href={`/admin/chats/${w.id}`}>{w.customer}</Link>
                          {w.handedOff && <span className={`${d.pill} ${d.pillMuted}`}>منتظر کارشناس</span>}
                          <span className={`${d.pill} ${tone === "late" ? d.pillLate : d.pillWait}`}>{waitText(w.since, now)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {waiting.count > waiting.list.length && (
                  <p className={d.note}>
                    و {fmtNum(waiting.count - waiting.list.length)} گفتگوی دیگر؛ <Link href="/admin/chats">همه‌ی گفتگوها</Link>
                  </p>
                )}
              </>
            )}
          </Card>
        )}

        {newCust && (
          <Card title="مشتری‌های جدید" icon="userPlus" testid="dash-new-customers" href="/admin/customers?sort=new" hrefLabel="فهرست">
            <div className={d.pair}>
              <div className={d.kpi}>
                <span className={d.kpiValue} data-testid="new-yesterday">
                  {fmtNum(newCust.yesterday)}
                </span>
                <span className={d.kpiLabel}>دیروز</span>
              </div>
              <div className={d.kpi}>
                <span className={d.kpiValue} data-testid="new-today">
                  {fmtNum(newCust.today)}
                </span>
                <span className={d.kpiLabel}>امروز تا الان</span>
              </div>
            </div>
          </Card>
        )}

        {leads && (
          <Card title="مشتری‌های جدی فعال" icon="star" tone="orange" testid="dash-leads" href="/admin/customers" hrefLabel="همه">
            <p className={d.sub} style={{ marginTop: 0 }}>
              ۵ مشتری با بیشترین امتیاز جدیت که در ۲۴ ساعت گذشته سایت را دیده‌اند
            </p>
            {leads.length === 0 ? (
              <p className={d.sub}>در ۲۴ ساعت گذشته مشتری امتیازداری سایت را ندیده است.</p>
            ) : (
              <ul className={d.list}>
                {leads.map((l) => (
                  <li key={l.id}>
                    <Link href={`/admin/customers/${l.id}`}>{l.name}</Link>
                    <span className={d.pill} style={{ ...SCORE_TONE_STYLE[scoreTone(l.score)], fontWeight: 700 }} data-testid="lead-score" data-tone={scoreTone(l.score)}>
                      {fmtNum(l.score)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {rates && (
          <Card title="نرخ ارز" icon="coin" tone={rates.some((r) => r.today === null) ? "orange" : "green"} testid="dash-rates" href="/admin/rates" hrefLabel="نرخ‌ها و هزینه‌ها">
            {rates.length === 0 && <p className={d.sub}>ارز فعالی تعریف نشده است.</p>}
            {rates.map((r) => (
              <div key={r.code} className={d.rateRow} data-testid={`rate-${r.code}`}>
                <span>
                  {r.nameFa}: <strong>{r.today === null ? "—" : `${fmtNum(r.today)} تومان`}</strong>
                  {r.yesterday !== null && (
                    <span className={d.sub}>
                      {" "}
                      · دیروز {fmtNum(r.yesterday)}
                      {r.today !== null && r.today !== r.yesterday && <span className={r.today > r.yesterday ? d.up : d.down}> {r.today > r.yesterday ? "▲" : "▼"}</span>}
                    </span>
                  )}
                </span>
                {r.today !== null ? (
                  <span className={`${d.pill} ${d.pillOk}`}>ثبت شده</span>
                ) : (
                  <span className={`${d.pill} ${d.pillWait}`} title={r.lastDate ? `آخرین: ${fmtDate(r.lastDate)}` : "هنوز هیچ نرخی"}>
                    امروز ثبت نشده
                  </span>
                )}
              </div>
            ))}
          </Card>
        )}

        {cost && (
          <Card title="هزینه‌ی هوش مصنوعی" icon="chip" testid="dash-ai-cost" href="/admin/ai" hrefLabel="دستیار هوشمند">
            <div className={d.pair}>
              <div className={d.kpi}>
                <span className={d.kpiValue} data-testid="cost-yesterday">
                  {fmtNum(Math.round(cost.yesterday))}
                </span>
                <span className={d.kpiLabel}>دیروز (تومان)</span>
              </div>
              <div className={d.kpi}>
                <span className={d.kpiValue} data-testid="cost-all">
                  {fmtNum(Math.round(cost.all))}
                </span>
                <span className={d.kpiLabel}>کل (تومان)</span>
              </div>
            </div>
            <p className={d.note}>امروز تا الان: {fmtNum(Math.round(cost.today))} تومان. همه‌ی کاربردها: چت، آزمون، متن محصول، تحلیل و تست اتصال.</p>
          </Card>
        )}

        {tests && tl && (
          <Card
            title="آزمون دستیار"
            icon="check"
            tone={testWarn ? "orange" : tests.last && tests.last.failed > 0 ? "orange" : "green"}
            testid="dash-ai-tests"
            href="/admin/ai/tests"
            hrefLabel="آزمون‌ها"
          >
            {tests.activeCases === 0 ? (
              <p className={d.sub}>هنوز سؤال آزمون فعالی تعریف نشده است.</p>
            ) : (
              (() => {
                const due = nextTestDue(tests.last?.startedAt ?? null, tl.staleDays, testWarn?.kind === "changed", now);
                return (
                  <>
                    <p style={{ margin: 0, fontSize: 13.5 }} data-testid="test-last">
                      آخرین آزمون کامل:{" "}
                      {tests.last ? (
                        <>
                          <strong>{fmtDateTime(tests.last.at)}</strong> · {fmtNum(tests.last.passed)} قبول، {fmtNum(tests.last.failed)} رد از {fmtNum(tests.last.total)}
                          {tests.last.mode === "test" && " (حالت آزمایشی)"}
                        </>
                      ) : (
                        "هنوز اجرا نشده"
                      )}
                    </p>
                    <p style={{ margin: "6px 0 0", fontSize: 13.5 }} data-testid="test-next">
                      آزمون بعدی:{" "}
                      {due.kind === "due" ? (
                        <strong>تا {fmtDate(due.at)}</strong>
                      ) : (
                        <span className={`${d.pill} ${d.pillWait}`}>
                          همین حالا لازم است
                          {due.reason === "changed" ? " (مدل یا دستورالعمل عوض شده)" : due.reason === "overdue" ? ` (بیش از ${fmtNum(tl.staleDays)} روز گذشته)` : ""}
                        </span>
                      )}
                    </p>
                    <p className={d.note}>زمان‌بندی خودکار ندارد؛ موعد = آخرین آزمون کامل + {fmtNum(tl.staleDays)} روز (تنظیم در صفحه‌ی دستیار هوشمند).</p>
                  </>
                );
              })()
            )}
          </Card>
        )}

        {insSet && (
          <Card
            title="تحلیل ۷ روز تا دیروز"
            icon="spark"
            tone={auto?.status === "ok" ? "green" : "gray"}
            testid="dash-insight"
            wide
            href="/admin/reports?range=7d"
            hrefLabel="گزارش‌ها"
          >
            <p className={d.sub} style={{ marginTop: 0 }}>
              {label(autoRange.from)} تا {label(autoRange.to)}
            </p>
            {!insSet.enabled || !insSet.auto ? (
              <p className={d.sub} data-testid="insight-auto-off">
                اجرای خودکار تحلیل روزانه خاموش است{!insSet.enabled ? " (خود تحلیل هوشمند هم خاموش است)" : ""}. روشن کردنش در{" "}
                <Link href="/admin/ai">دستیار هوشمند ← تحلیل هوشمند گزارش</Link>.
              </p>
            ) : auto && auto.status === "ok" ? (
              <div className={d.insight} data-testid="dash-insight-result">
                <ul>
                  {auto.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
                <p className={d.note}>
                  ساخته‌شده {fmtDateTime(auto.at)} · هزینه {fmtNum(Math.round(auto.costToman))} تومان
                  {auto.dropped > 0 && ` · ${fmtNum(auto.dropped)} پیشنهاد به‌خاطر عدد خارج از داده یا اطلاعات ممنوع حذف شد`}
                </p>
              </div>
            ) : auto ? (
              <p className={d.sub} data-testid="insight-auto-failed">
                تحلیل امروز {auto.status === "guard_block" ? "قابل اعتماد نبود (همه‌ی پیشنهادها از محافظ رد شدند)" : "انجام نشد (خطا یا دیر شدن جواب)"}؛ فردا دوباره امتحان می‌شود.
                جزئیات در «آخرین درخواست‌ها».
              </p>
            ) : !autoInsightDue(now, autoInsightHour(process.env.AUTO_INSIGHT_HOUR)) ? (
              <p className={d.sub} data-testid="insight-auto-early">
                امروز بعد از ساعت ۶ صبح ساخته می‌شود.
              </p>
            ) : (
              <p className={d.sub} data-testid="insight-auto-none">
                امروز ساخته نشد: داده‌ی کافی نبود، سقف هزینه‌ی روزانه‌ی تحلیل پر بود، یا کلید هوش مصنوعی تعریف نشده است (حالت آزمایشی). با دکمه‌ی «تحلیل کن» در{" "}
                <Link href="/admin/reports?range=7d">گزارش‌ها</Link> دلیلش را ببینید.
              </p>
            )}
          </Card>
        )}
      </div>

      {(seeActivity || seeSettings) && (
        <div className={d.links}>
          {seeActivity && <Link href="/admin/activity">لاگ فعالیت</Link>}
          {seeSettings && <Link href="/admin/settings">تنظیمات و سوئیچ‌ها</Link>}
        </div>
      )}
    </>
  );
}
