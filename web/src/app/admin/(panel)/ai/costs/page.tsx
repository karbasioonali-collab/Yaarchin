import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/can";
import { COST_GROUP_COLOR, COST_GROUP_FA, COST_GROUPS, costChart, niceMax, type Period, PERIOD_FA, PERIOD_WINDOW_FA, PERIODS } from "@/lib/ai/cost-chart";
import { dailyCosts } from "@/lib/ai/costs";
import { fmtNum } from "@/lib/format";
import { tehranYmd } from "@/lib/tehran-time";
import styles from "../../panel.module.css";
import d from "../../dashboard.module.css";
import c from "./costs.module.css";

export const metadata: Metadata = { title: "هزینه‌ی هوش مصنوعی" };

const W = 640;
const H = 260;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 26;
const PAD_B = 34;
const toman = (n: number) => `${fmtNum(Math.round(n))} تومان`;

// نمودار ستونی روی‌هم هزینه‌ی هوش مصنوعی به تقویم شمسی (بخش ۵۲). دسترسی: ai.costs (جدا از ai.settings صفحه‌ی دستیار).
// بی‌جاوااسکریپت: هر ستون لینک است (?p=…&s=شروع ستون) و جزئیات ستون انتخاب‌شده زیر نمودار می‌آید؛ روی موبایل با لمس هم کار می‌کند.
export default async function AiCostsPage(props: PageProps<"/admin/ai/costs">) {
  await requirePermission("ai.costs");
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const p: Period = (PERIODS as string[]).includes(one(sp.p) ?? "") ? (one(sp.p) as Period) : "month";
  const rows = await dailyCosts();
  const today = tehranYmd();
  const ch = costChart(rows ?? [], p, today);
  const sel = ch.bars.find((b) => b.start === one(sp.s)) ?? ch.bars[ch.bars.length - 1];
  const max = niceMax(Math.max(0, ...ch.bars.map((b) => b.total)));
  const n = ch.bars.length;
  const slot = (W - PAD_L - PAD_R) / n;
  const bw = Math.max(4, Math.min(40, slot * 0.68));
  const plotH = H - PAD_T - PAD_B;
  const yOf = (v: number) => PAD_T + plotH - (v / max) * plotH;
  // برچسب زیر ستون: روزانه هر ۵ روز یک بار، بقیه همه (سال‌ها و ماه‌ها جا می‌شوند)
  const tickEvery = p === "day" ? 5 : p === "week" ? 2 : 1;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>هزینه‌ی هوش مصنوعی</h1>
          <p className={styles.pageSub}>به تومان، فقط درخواست‌های زنده (حالت آزمایشی هزینه ندارد) · روزها به وقت تهران و تقویم شمسی</p>
        </div>
      </div>
      {rows === null && <div className={styles.impersonation}>این بخش بعد از اجرای migration ۰۰۱۰ فعال می‌شود.</div>}

      <div className={d.grid} style={{ marginBottom: 16 }}>
        <section className={d.card} data-testid="cost-all-total">
          <div className={d.sub}>کل هزینه از اول</div>
          <div className={d.big}>{toman(ch.all)}</div>
        </section>
        <section className={`${d.card} ${d.toneOrange}`} data-testid="cost-window-total">
          <div className={d.sub}>جمع {PERIOD_WINDOW_FA[p]}</div>
          <div className={d.big}>{toman(ch.windowTotal)}</div>
        </section>
      </div>

      <section className={d.card}>
        <nav className={styles.tabs} aria-label="دوره" data-testid="cost-periods">
          {PERIODS.map((k) => (
            <Link key={k} href={`?p=${k}`} className={`${styles.tab} ${p === k ? styles.tabActive : ""}`}>
              {PERIOD_FA[k]}
            </Link>
          ))}
        </nav>
        <div className={c.chartWrap}>
          <svg className={c.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`نمودار هزینه، ${PERIOD_WINDOW_FA[p]}`} data-testid="cost-chart">
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={PAD_L} x2={W - PAD_R} y1={yOf(max * f)} y2={yOf(max * f)} className={c.grid} />
                {f > 0 && (
                  <text x={W - PAD_R} y={yOf(max * f) - 3} className={c.axis} textAnchor="end">
                    {fmtNum(Math.round(max * f))}
                  </text>
                )}
              </g>
            ))}
            {ch.bars.map((b, i) => {
              const x = PAD_L + i * slot + (slot - bw) / 2;
              let y = yOf(0);
              return (
                <a key={b.start} href={`?p=${p}&s=${b.start}#detail`} data-testid="cost-bar" data-start={b.start} data-total={Math.round(b.total)}>
                  <title>{`${b.label}: ${toman(b.total)}`}</title>
                  {/* ناحیه‌ی لمس کل ستون، حتی وقتی هزینه صفر است */}
                  <rect x={PAD_L + i * slot} y={PAD_T} width={slot} height={plotH} className={`${c.hit} ${b.start === sel?.start ? c.hitSel : ""}`} />
                  {COST_GROUPS.map((g) => {
                    const v = b.parts[g];
                    if (v <= 0) return null;
                    const h = Math.max(1, (v / max) * plotH);
                    y -= h;
                    return <rect key={g} x={x} y={y} width={bw} height={h} fill={COST_GROUP_COLOR[g]} data-group={g} />;
                  })}
                  {i % tickEvery === (n - 1) % tickEvery && (
                    <text x={x + bw / 2} y={H - 6} className={c.axis} textAnchor="middle">
                      {b.tick}
                    </text>
                  )}
                </a>
              );
            })}
          </svg>
        </div>
        <ul className={c.legend} data-testid="cost-legend">
          {COST_GROUPS.map((g) => (
            <li key={g}>
              <span className={c.swatch} style={{ background: COST_GROUP_COLOR[g] }} />
              {COST_GROUP_FA[g]}
            </li>
          ))}
        </ul>

        {sel && (
          <div id="detail" className={c.detail} data-testid="cost-detail">
            <h2 className={c.detailTitle}>
              {sel.label}: {toman(sel.total)}
            </h2>
            <ul className={c.parts}>
              {COST_GROUPS.filter((g) => sel.parts[g] > 0).map((g) => (
                <li key={g} data-group={g}>
                  <span className={c.swatch} style={{ background: COST_GROUP_COLOR[g] }} />
                  {COST_GROUP_FA[g]}: <strong>{toman(sel.parts[g])}</strong>
                </li>
              ))}
              {sel.total === 0 && <li className={styles.muted}>هزینه‌ای ثبت نشده است.</li>}
            </ul>
            <p className={d.note}>روی هر ستون بزنید تا جزئیاتش اینجا بیاید.</p>
          </div>
        )}
      </section>

      <section className={d.card} style={{ marginTop: 16 }} data-testid="cost-all-parts">
        <h2 className={c.detailTitle}>کل از اول، به تفکیک کاربرد</h2>
        <ul className={c.parts}>
          {COST_GROUPS.map((g) => (
            <li key={g} data-group={g}>
              <span className={c.swatch} style={{ background: COST_GROUP_COLOR[g] }} />
              {COST_GROUP_FA[g]}: <strong>{toman(ch.allParts[g])}</strong>
            </li>
          ))}
        </ul>
        <p className={d.note}>
          «آزمون دستیار» = اجرای آزمون و «پیشنهاد سؤال فریبنده با AI». «سایر» = کاربردهای دیگر یا تازه. سقف‌های روزانه در صفحه‌ی <Link href="/admin/ai">دستیار هوشمند</Link>.
        </p>
      </section>
    </>
  );
}
