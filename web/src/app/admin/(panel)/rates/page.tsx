import { JalaliDateInput } from "@/components/admin/JalaliDateInput";
import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { db } from "@/db/client";
import { exchangeRates, users } from "@/db/schema";
import { can, requireAnyPermission } from "@/lib/auth/can";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { currencyRows } from "@/lib/pricing/admin";
import { RATE_KIND_FA, RATE_PERMS } from "@/lib/pricing/labels";
import { tehranDate } from "@/lib/pricing/snapshot";
import styles from "../panel.module.css";
import { addCurrencyAction, addRatesAction, toggleCurrencyAction } from "./actions";

export const metadata: Metadata = { title: "ارزها و نرخ روزانه" };

// نرخ روزانه‌ی ارزها به تومان: بازار (برای کالا، حمل و هزینه‌ها) و گمرکی (برای حقوق ورودی و/یا ارزش افزوده؛ اختیاری).
export default async function RatesPage() {
  const a = await requireAnyPermission(RATE_PERMS);
  const [canEnter, canManage] = await Promise.all([can(a.user, "rates.enter"), can(a.user, "costs.manage")]);
  const today = tehranDate();
  const rows = await currencyRows();
  const foreign = rows.filter((c) => !c.isBase);
  const active = foreign.filter((c) => c.isActive);
  const history = await db
    .select({ r: exchangeRates, by: users.fullName })
    .from(exchangeRates)
    .leftJoin(users, eq(users.id, exchangeRates.createdBy))
    .orderBy(desc(exchangeRates.createdAt), desc(exchangeRates.id))
    .limit(60);
  const nameOf = new Map(rows.map((c) => [c.code, c.nameFa]));

  return (
    <div className={styles.grid}>
      <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
        <h2 className={styles.cardTitle}>نرخ فعلی ارزها (تومان)</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ارز</th>
                <th>نرخ بازار</th>
                <th>نرخ گمرکی</th>
                <th>امروز</th>
              </tr>
            </thead>
            <tbody>
              {foreign.map((c) => (
                <tr key={c.code}>
                  <td>
                    {c.nameFa} <span className={`${styles.mono} ${styles.muted}`}>{c.code}</span>
                    {!c.isActive && <span className={`${styles.badge} ${styles.badgeMuted}`}>غیرفعال</span>}
                  </td>
                  <td>
                    {c.market ? (
                      <>
                        <strong>{fmtNum(c.market.rate)}</strong>
                        <div className={styles.muted} style={{ fontSize: 12 }}>
                          {fmtDate(c.market.date)} · {c.market.by ?? "سیستم"}
                        </div>
                      </>
                    ) : (
                      <span className={styles.muted}>ثبت نشده</span>
                    )}
                  </td>
                  <td>
                    {c.customs ? (
                      <>
                        <strong>{fmtNum(c.customs.rate)}</strong>
                        <div className={styles.muted} style={{ fontSize: 12 }}>
                          {fmtDate(c.customs.date)} · {c.customs.by ?? "سیستم"}
                        </div>
                      </>
                    ) : (
                      <span className={styles.muted}>ثبت نشده (نرخ بازار استفاده می‌شود)</span>
                    )}
                  </td>
                  <td>
                    {!c.isActive ? (
                      "—"
                    ) : c.market?.date === today ? (
                      <span className={styles.badge}>ثبت شده</span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeWarn}`}>ثبت نشده</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.muted} style={{ fontSize: 13, marginBottom: 0 }}>
          اگر نرخ امروز ثبت نشود، سایت با آخرین نرخ ثبت‌شده حساب می‌کند و تاریخ همان نرخ را کنار قیمت نشان می‌دهد. نرخ گمرکی هشدار روزانه ندارد.
        </p>
      </div>

      {canEnter && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>ثبت نرخ</h2>
          <ActionForm action={addRatesAction} submitLabel="ثبت نرخ‌ها">
            <JalaliDateInput label="تاریخ نرخ" name="rateDate" defaultValue={today} max={today} required />
            {active.map((c) => (
              <div key={c.code} className={styles.row}>
                <Field label={`${c.nameFa} — بازار (تومان)`} name={`market_${c.code}`} inputMode="decimal" ltr placeholder={c.market ? String(c.market.rate) : ""} />
                <Field label={`${c.nameFa} — گمرکی (اختیاری)`} name={`customs_${c.code}`} inputMode="decimal" ltr placeholder={c.customs ? String(c.customs.rate) : ""} />
              </div>
            ))}
            <p className={ui.hint} style={{ margin: 0 }}>
              فقط خانه‌های پرشده ثبت می‌شوند. نرخ قبلی بازنویسی نمی‌شود؛ هر ثبت یک ردیف تازه در تاریخچه است. عدد فارسی هم قبول است.
            </p>
            <Field label="یادداشت (اختیاری)" name="note" maxLength={500} placeholder="مثلاً منبع نرخ" />
          </ActionForm>
        </div>
      )}

      {canManage && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>ارزها</h2>
          {foreign.map((c) => (
            <form key={c.code} action={toggleCurrencyAction} className={styles.switchRow}>
              <input type="hidden" name="code" value={c.code} />
              <span>
                {c.nameFa} <span className={`${styles.mono} ${styles.muted}`}>{c.code}</span>
              </span>
              <button type="submit" className={styles.btnGhost}>
                {c.isActive ? "غیرفعال کن" : "فعال کن"}
              </button>
            </form>
          ))}
          <p className={styles.muted} style={{ fontSize: 13 }}>
            ارز غیرفعال در فرم نرخ و هشدار روزانه نمی‌آید و برای آیتم تازه قابل انتخاب نیست؛ نرخ‌های قبلی‌اش می‌مانند. تومان ارز پایه است (نرخ = ۱).
          </p>
          <h3 className={styles.groupTitle}>افزودن ارز</h3>
          <ActionForm action={addCurrencyAction} submitLabel="افزودن ارز" submitVariant="secondary">
            <div className={styles.row}>
              <Field label="کد سه‌حرفی" name="code" maxLength={3} ltr placeholder="EUR" required />
              <Field label="اسم فارسی" name="nameFa" maxLength={60} placeholder="یورو" required />
            </div>
          </ActionForm>
        </div>
      )}

      <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
        <h2 className={styles.cardTitle}>تاریخچه‌ی نرخ‌ها (۶۰ ثبت آخر)</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>زمان ثبت</th>
                <th>ارز</th>
                <th>نوع</th>
                <th>نرخ (تومان)</th>
                <th>تاریخ نرخ</th>
                <th>ثبت‌کننده</th>
                <th>یادداشت</th>
              </tr>
            </thead>
            <tbody>
              {history.map(({ r, by }) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.createdAt)}</td>
                  <td>{nameOf.get(r.currencyCode) ?? r.currencyCode}</td>
                  <td>{RATE_KIND_FA[r.kind]}</td>
                  <td>
                    <strong>{fmtNum(Number(r.rateToman))}</strong>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.rateDate)}</td>
                  <td>{by ?? (r.source === "demo" ? "نمونه" : "سیستم")}</td>
                  <td className={styles.muted}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!history.length && <p className={styles.muted}>هنوز نرخی ثبت نشده.</p>}
      </div>
    </div>
  );
}
