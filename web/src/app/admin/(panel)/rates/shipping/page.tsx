import { JalaliDateInput } from "@/components/admin/JalaliDateInput";
import type { Metadata } from "next";
import { asc, desc, eq } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { Checkbox, Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { db } from "@/db/client";
import { currencies, shippingMethods, shippingMethodVersions, users } from "@/db/schema";
import { can, requireAnyPermission } from "@/lib/auth/can";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { FACTOR_HINT, RATE_PERMS } from "@/lib/pricing/labels";
import styles from "../../panel.module.css";
import { addShippingVersionAction } from "../actions";

export const metadata: Metadata = { title: "روش‌های حمل" };

type Version = typeof shippingMethodVersions.$inferSelect;
const n = (v: string | null) => (v === null ? "" : String(Number(v)));

// چهار روش حمل، هرکدام جدا و نسخه‌دار. نسخه‌ی «فعلی» = جدیدترین نسخه‌ای که «معتبر از» آن رسیده.
export default async function ShippingPage() {
  const a = await requireAnyPermission(RATE_PERMS);
  const canManage = await can(a.user, "costs.manage");
  const [methods, versions, curs] = await Promise.all([
    db.select().from(shippingMethods).orderBy(asc(shippingMethods.sortOrder)),
    db
      .select({ v: shippingMethodVersions, by: users.fullName })
      .from(shippingMethodVersions)
      .leftJoin(users, eq(users.id, shippingMethodVersions.createdBy))
      .orderBy(desc(shippingMethodVersions.validFrom), desc(shippingMethodVersions.id)),
    db.select().from(currencies).orderBy(asc(currencies.sortOrder)),
  ]);
  const curName = new Map(curs.map((c) => [c.code, c.nameFa]));
  const activeCurs = curs.filter((c) => c.isActive);
  const now = new Date().getTime();

  if (!methods.length) return <div className={styles.impersonation}>روش‌های حمل هنوز ساخته نشده‌اند؛ در کنسول لیارا npm run db:seed را اجرا کنید.</div>;

  return (
    <>
      <p className={styles.muted} style={{ marginTop: 0, fontSize: 14 }}>
        هزینه‌ی حمل = بیشترِ (حداقل هزینه) و (وزن قابل‌محاسبه × نرخ هر کیلو + حجم × نرخ هر متر مکعب). وزن قابل‌محاسبه = بیشترِ وزن واقعی و حجم × ضریب وزن حجمی. وزن و حجم از اطلاعات
        کارتن محصول و تعداد کارتن‌ها (تعداد سفارش ÷ تعداد در کارتن، رو به بالا) حساب می‌شود. روش غیرفعال در سایت نمایش داده نمی‌شود.
      </p>
      <div className={styles.grid}>
        {methods.map((m) => {
          const all = versions.filter((x) => x.v.methodKey === m.key);
          const current = all.find((x) => x.v.validFrom.getTime() <= now)?.v;
          const future = all.filter((x) => x.v.validFrom.getTime() > now);
          return (
            <div key={m.key} className={styles.card}>
              <h2 className={styles.cardTitle}>
                {m.nameFa}{" "}
                {current?.isActive ? (
                  <span className={styles.badge}>فعال</span>
                ) : (
                  <span className={`${styles.badge} ${styles.badgeMuted}`}>{current ? "غیرفعال" : "تنظیم نشده"}</span>
                )}
              </h2>
              {current ? (
                <Summary v={current} cur={curName.get(current.currencyCode) ?? current.currencyCode} />
              ) : (
                <p className={styles.muted}>هنوز نرخی ثبت نشده؛ این روش در سایت نمایش داده نمی‌شود.</p>
              )}
              {future.map(({ v }) => (
                <p key={v.id} className={`${styles.badge} ${styles.badgeWarn}`}>
                  نسخه‌ی زمان‌بندی‌شده از {fmtDateTime(v.validFrom)}
                </p>
              ))}

              {canManage && (
                <details className={styles.detailsBox} style={{ marginTop: 12 }}>
                  <summary>ثبت نسخه‌ی تازه</summary>
                  <ActionForm action={addShippingVersionAction} submitLabel="ثبت نسخه">
                    <input type="hidden" name="methodKey" value={m.key} />
                    <Checkbox label="فعال (در سایت و ماشین‌حساب)" name="isActive" defaultChecked={current?.isActive ?? true} />
                    <label className={ui.field}>
                      <span className={ui.label}>ارز نرخ‌ها</span>
                      <select name="currency" defaultValue={current?.currencyCode ?? "USD"} className={ui.select}>
                        {activeCurs.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.nameFa} ({c.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className={styles.row}>
                      <Field label="نرخ هر کیلو" name="ratePerKg" defaultValue={n(current?.ratePerKg ?? null)} inputMode="decimal" ltr placeholder="خالی = ندارد" />
                      <Field label="نرخ هر متر مکعب" name="ratePerCbm" defaultValue={n(current?.ratePerCbm ?? null)} inputMode="decimal" ltr placeholder="خالی = ندارد" />
                    </div>
                    <div className={styles.row}>
                      <Field
                        label="ضریب وزن حجمی (کیلو در هر م³)"
                        name="volumetricFactor"
                        defaultValue={n(current?.volumetricFactor ?? null)}
                        inputMode="decimal"
                        ltr
                        placeholder={FACTOR_HINT[m.key]}
                        hint={`معمول: ${FACTOR_HINT[m.key]}. خالی = فقط وزن واقعی.`}
                      />
                      <Field label="حداقل هزینه" name="minCharge" defaultValue={n(current?.minCharge ?? null)} inputMode="decimal" ltr placeholder="خالی = ندارد" />
                    </div>
                    <div className={styles.row}>
                      <Field label="زمان رسیدن: حداقل روز" name="transitMinDays" defaultValue={current?.transitMinDays ?? ""} inputMode="numeric" ltr />
                      <Field label="حداکثر روز" name="transitMaxDays" defaultValue={current?.transitMaxDays ?? ""} inputMode="numeric" ltr />
                    </div>
                    <JalaliDateInput
                      label="معتبر از (اختیاری؛ خالی = همین حالا)"
                      name="validFrom"
                      withTime
                      hint="ساعت تهران؛ ساعت خالی = ۰۰:۰۰. برای تغییر زمان‌بندی‌شده، تاریخ آینده بدهید."
                    />
                    <Field label="یادداشت (اختیاری)" name="note" maxLength={500} />
                  </ActionForm>
                </details>
              )}

              <details className={styles.detailsBox}>
                <summary>تاریخچه ({fmtNum(all.length)} نسخه)</summary>
                {all.map(({ v, by }) => (
                  <div key={v.id} className={styles.batch}>
                    <div className={styles.timelineHead}>
                      <strong>از {fmtDateTime(v.validFrom)}</strong>
                      <span className={styles.muted}>{by ?? (v.source === "demo" ? "نمونه" : "سیستم")}</span>
                      {!v.isActive && <span className={`${styles.badge} ${styles.badgeMuted}`}>غیرفعال</span>}
                    </div>
                    <Summary v={v} cur={curName.get(v.currencyCode) ?? v.currencyCode} />
                    {v.note && <div className={styles.muted}>{v.note}</div>}
                  </div>
                ))}
              </details>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Summary({ v, cur }: { v: Version; cur: string }) {
  const parts = [
    v.ratePerKg !== null && `هر کیلو ${fmtNum(Number(v.ratePerKg))} ${cur}`,
    v.ratePerCbm !== null && `هر م³ ${fmtNum(Number(v.ratePerCbm))} ${cur}`,
    v.volumetricFactor !== null && `ضریب ${fmtNum(Number(v.volumetricFactor))}`,
    v.minCharge !== null && `حداقل ${fmtNum(Number(v.minCharge))} ${cur}`,
    v.transitMinDays !== null && `${fmtNum(v.transitMinDays)}${v.transitMaxDays !== v.transitMinDays && v.transitMaxDays !== null ? ` تا ${fmtNum(v.transitMaxDays)}` : ""} روز`,
  ].filter(Boolean);
  return <div style={{ fontSize: 14 }}>{parts.join(" · ") || "—"}</div>;
}
