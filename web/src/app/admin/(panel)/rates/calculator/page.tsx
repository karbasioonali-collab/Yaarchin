import type { Metadata } from "next";
import Link from "next/link";
import { asc, ne } from "drizzle-orm";
import ui from "@/components/ui/ui.module.css";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { requireAnyPermission } from "@/lib/auth/can";
import { PRODUCT_STATUS_FA } from "@/lib/catalog/admin-labels";
import { fmtDate, fmtNum, unitFa } from "@/lib/format";
import { round1000, type MethodResult } from "@/lib/pricing/compute";
import { clampQty, landedCostFor } from "@/lib/pricing/landed";
import { METHOD_FA, RATE_KIND_FA, RATE_PERMS } from "@/lib/pricing/labels";
import styles from "../../panel.module.css";

export const metadata: Metadata = { title: "ماشین‌حساب آزمایشی" };
const UUID = /^[0-9a-f-]{36}$/i;
const SECTION_TITLE: Record<string, string> = { goods: "کالا", shipping: "حمل", costs: "بیمه و هزینه‌های دیگر", duty: "حقوق ورودی", vat: "مالیات ارزش افزوده", total: "جمع" };
const toman = (n: number | null) => (n === null ? "—" : Math.round(n).toLocaleString("fa-IR"));

// ماشین‌حساب آزمایشی: همان محاسبه‌ی سایت، با ریز هر ردیف (فرمول و عدد دقیق) برای بررسی درستی.
export default async function CalculatorPage({ searchParams }: PageProps<"/admin/rates/calculator">) {
  await requireAnyPermission(RATE_PERMS);
  const sp = await searchParams;
  const productId = typeof sp.product === "string" && UUID.test(sp.product) ? sp.product : "";
  const method = typeof sp.method === "string" && sp.method in METHOD_FA ? sp.method : "";
  const list = await db
    .select({ id: products.id, titleFa: products.titleFa, status: products.status, priceUnit: products.priceUnit })
    .from(products)
    .where(ne(products.status, "archived"))
    .orderBy(asc(products.titleFa));
  const selected = list.find((p) => p.id === productId);
  // تعداد خالی ← اول با تعداد ۱ حساب می‌کنیم تا حداقل سفارش معلوم شود، بعد با همان حداقل سفارش
  let r = selected ? await landedCostFor({ productId, qty: clampQty(sp.qty, 1) }) : null;
  if (r && !sp.qty && r.moq) r = await landedCostFor({ productId, qty: r.moq });
  const methods = r ? r.methods.filter((m) => !method || m.key === method) : [];
  const u = unitFa(selected?.priceUnit ?? "piece");

  return (
    <>
      <div className={styles.card}>
        <form method="get" className={styles.row}>
          <label className={ui.field} style={{ flex: "3 1 260px" }}>
            <span className={ui.label}>محصول</span>
            <select name="product" defaultValue={productId} className={ui.select} required>
              <option value="">انتخاب کنید…</option>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titleFa}
                  {p.status !== "published" ? ` (${PRODUCT_STATUS_FA[p.status]})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={ui.field}>
            <span className={ui.label}>تعداد</span>
            <input
              name="qty"
              defaultValue={typeof sp.qty === "string" ? sp.qty : r ? String(r.qty) : ""}
              inputMode="numeric"
              className={`${ui.input} ${ui.ltr}`}
              placeholder="حداقل سفارش"
            />
          </label>
          <label className={ui.field}>
            <span className={ui.label}>روش حمل</span>
            <select name="method" defaultValue={method} className={ui.select}>
              <option value="">همه</option>
              {Object.entries(METHOD_FA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div style={{ flex: "0 0 auto" }}>
            <button type="submit" className={styles.btn}>
              محاسبه
            </button>
          </div>
        </form>
      </div>

      {selected && r && (
        <>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>
              <Link href={`/admin/products/${selected.id}`}>{selected.titleFa}</Link> · {fmtNum(r.qty)} {u}
            </h2>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <div className={styles.statValue}>{fmtNum(r.suppliers)}</div>
                <div className={styles.statLabel}>کارخانه‌ی دارای قیمت</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statValue}>{r.moq === null ? "—" : fmtNum(r.moq)}</div>
                <div className={styles.statLabel}>کمترین حداقل سفارش</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statValue}>{r.leadDays === null ? "—" : `${fmtNum(r.leadDays)} روز`}</div>
                <div className={styles.statLabel}>میانگین آماده‌سازی</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statValue}>{r.packing.cartons === null ? "—" : fmtNum(r.packing.cartons)}</div>
                <div className={styles.statLabel}>کارتن</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statValue}>{r.packing.weightKg === null ? "—" : fmtNum(Math.round(r.packing.weightKg * 100) / 100)}</div>
                <div className={styles.statLabel}>وزن واقعی (کیلو)</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statValue}>{r.packing.volumeCbm === null ? "—" : fmtNum(Math.round(r.packing.volumeCbm * 1000) / 1000)}</div>
                <div className={styles.statLabel}>حجم (متر مکعب)</div>
              </div>
            </div>
            {r.belowMoq && <p className={`${styles.badge} ${styles.badgeWarn}`}>تعداد کمتر از حداقل سفارش است؛ پله‌ی اول قیمت استفاده شد.</p>}
            <p style={{ fontSize: 14, margin: "4px 0" }}>
              HS code: {r.hs ? <Link href={`/admin/rates/hs/${r.hs.code}`}>{r.hs.code}</Link> : <span className={styles.muted}>در لیست نیست / ثبت نشده</span>}
              {r.hs?.titleFa && <span className={styles.muted}> · {r.hs.titleFa}</span>}
            </p>
            <h3 className={styles.groupTitle}>نرخ‌های استفاده‌شده</h3>
            {r.ratesUsed.length ? (
              <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 14 }}>
                {r.ratesUsed.map((x) => (
                  <li key={`${x.currency}:${x.kind}`}>
                    {x.currency} ({RATE_KIND_FA[x.kind]}): {fmtNum(x.rate)} تومان — تاریخ {fmtDate(x.date)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>هیچ نرخ ارزی استفاده نشد.</p>
            )}
            {r.customsFallback.length > 0 && (
              <p className={`${styles.badge} ${styles.badgeWarn}`} style={{ marginTop: 8 }}>
                نرخ گمرکی {r.customsFallback.join("، ")} ثبت نشده؛ برای حقوق ورودی/ارزش افزوده با نرخ بازار حساب شد.
              </p>
            )}
            {r.ratesStale && <p className={styles.muted}>نرخ بازار امروز ثبت نشده؛ با آخرین نرخ (تاریخ {fmtDate(r.ratesDate)}) حساب شد.</p>}
          </div>

          {methods.map((m) => (
            <MethodCard key={m.key} m={m} unit={u} />
          ))}
        </>
      )}
      {selected && !r && <div className={styles.card}>محصول پیدا نشد.</div>}
    </>
  );
}

function MethodCard({ m, unit }: { m: MethodResult; unit: string }) {
  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>
        {m.nameFa} {!m.isActive && <span className={`${styles.badge} ${styles.badgeMuted}`}>غیرفعال (در سایت نمایش داده نمی‌شود)</span>}
        {m.status === "ok" ? <span className={styles.badge}>کامل</span> : <span className={`${styles.badge} ${styles.badgeWarn}`}>استعلام از کارشناس</span>}
      </h2>
      {m.missing.length > 0 && (
        <ul style={{ margin: "0 0 10px", paddingInlineStart: 18, fontSize: 14, color: "var(--orange-dark)" }}>
          {m.missing.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ردیف</th>
              <th>فرمول</th>
              <th>تومان</th>
            </tr>
          </thead>
          <tbody>
            {m.lines.map(({ section, line }, i) => {
              const head = section !== "total" && (i === 0 || m.lines[i - 1].section !== section);
              return (
                <FragmentRows key={i} head={head ? SECTION_TITLE[section] : null}>
                  <tr className={section === "total" ? styles.totalRow : undefined}>
                    <td>{line.label}</td>
                    <td className={styles.formulaCell}>{line.formula}</td>
                    <td className={styles.num}>{toman(line.toman)}</td>
                  </tr>
                </FragmentRows>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 14, marginBottom: 0 }}>
        {m.total !== null ? (
          <>
            هر {unit}: <strong>{toman(m.unit)}</strong> تومان (در سایت: {fmtNum(round1000(m.unit!))}) · جمع در سایت: {fmtNum(round1000(m.total))} تومان
          </>
        ) : (
          "در سایت: «استعلام از کارشناس»"
        )}
        {m.days && (
          <>
            {" "}
            · زمان کل: {fmtNum(m.days.min)}
            {m.days.max !== m.days.min && ` تا ${fmtNum(m.days.max)}`} روز
          </>
        )}
      </p>
    </div>
  );
}

function FragmentRows({ head, children }: { head: string | null; children: React.ReactNode }) {
  return (
    <>
      {head && (
        <tr className={styles.sectionRow}>
          <td colSpan={3}>{head}</td>
        </tr>
      )}
      {children}
    </>
  );
}
