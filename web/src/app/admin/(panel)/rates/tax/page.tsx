import { JalaliDateInput } from "@/components/admin/JalaliDateInput";
import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { Checkbox, Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { db } from "@/db/client";
import { taxVersions, users } from "@/db/schema";
import { can, requireAnyPermission } from "@/lib/auth/can";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { BASE_FA, CUSTOMS_FOR_FA, RATE_PERMS, VAT_BASES } from "@/lib/pricing/labels";
import styles from "../../panel.module.css";
import { addTaxVersionAction } from "../actions";

export const metadata: Metadata = { title: "ارزش افزوده و نرخ گمرکی" };

type Tax = typeof taxVersions.$inferSelect;
const summary = (t: Tax) =>
  `${fmtNum(Number(t.vatPercent))}٪ از ${t.vatBase.map((b) => BASE_FA[b]).join(" + ")} · نرخ گمرکی برای: ${t.customsRateFor.length ? t.customsRateFor.map((c) => CUSTOMS_FOR_FA[c]).join(" و ") : "هیچ‌کدام (همه با نرخ بازار)"}`;

// مالیات ارزش افزوده (جدا از حقوق ورودی) و اینکه نرخ گمرکی ارز برای کدام محاسبه‌ها استفاده شود. نسخه‌دار.
export default async function TaxPage() {
  const a = await requireAnyPermission(RATE_PERMS);
  const canManage = await can(a.user, "costs.manage");
  const versions = await db
    .select({ t: taxVersions, by: users.fullName })
    .from(taxVersions)
    .leftJoin(users, eq(users.id, taxVersions.createdBy))
    .orderBy(desc(taxVersions.validFrom), desc(taxVersions.id));
  const now = new Date().getTime();
  const current = versions.find((x) => x.t.validFrom.getTime() <= now)?.t;

  return (
    <div className={styles.grid}>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>تنظیم فعلی</h2>
        <p style={{ fontSize: 15 }}>{current ? summary(current) : "هنوز ثبت نشده؛ تا ثبت نشود، قیمت تمام‌شده «استعلام» نمایش داده می‌شود."}</p>
        <p className={styles.muted} style={{ fontSize: 13 }}>
          نرخ بازار همیشه برای قیمت کالا، حمل، بیمه و هزینه‌های دیگر استفاده می‌شود. نرخ گمرکی فقط برای پایه‌ی محاسبه‌های تیک‌خورده؛ ارزی که نرخ گمرکی ندارد با نرخ بازار حساب
          می‌شود (ماشین‌حساب آزمایشی این را نشان می‌دهد).
        </p>
        {canManage && (
          <>
            <h3 className={styles.groupTitle}>نسخه‌ی تازه</h3>
            <ActionForm action={addTaxVersionAction} submitLabel="ثبت نسخه">
              <Field label="درصد مالیات ارزش افزوده" name="vatPercent" defaultValue={current ? String(Number(current.vatPercent)) : "10"} inputMode="decimal" ltr required />
              <fieldset className={styles.iconPicker}>
                <legend className={ui.label}>پایه‌ی ارزش افزوده</legend>
                <div className={styles.checkRow}>
                  {VAT_BASES.map((b) => (
                    <Checkbox key={b} label={BASE_FA[b]} name="vatBase" value={b} defaultChecked={(current?.vatBase ?? ["goods", "shipping"]).includes(b)} />
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.iconPicker}>
                <legend className={ui.label}>نرخ گمرکی ارز برای کدام محاسبه‌ها؟</legend>
                <div className={styles.checkRow}>
                  {(["duty", "vat"] as const).map((c) => (
                    <Checkbox key={c} label={CUSTOMS_FOR_FA[c]} name="customsRateFor" value={c} defaultChecked={(current?.customsRateFor ?? ["duty", "vat"]).includes(c)} />
                  ))}
                </div>
              </fieldset>
              <JalaliDateInput label="معتبر از (اختیاری؛ خالی = همین حالا)" name="validFrom" withTime hint="ساعت تهران؛ ساعت خالی = ۰۰:۰۰." />
              <Field label="یادداشت (اختیاری)" name="note" maxLength={500} />
            </ActionForm>
          </>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>تاریخچه ({fmtNum(versions.length)} نسخه)</h2>
        {versions.map(({ t, by }) => (
          <div key={t.id} className={styles.batch}>
            <div className={styles.timelineHead}>
              <strong>از {fmtDateTime(t.validFrom)}</strong>
              {t.validFrom.getTime() > now && <span className={`${styles.badge} ${styles.badgeWarn}`}>زمان‌بندی‌شده</span>}
              {t.id === current?.id && <span className={styles.badge}>فعلی</span>}
              <span className={styles.muted}>{by ?? (t.source === "demo" ? "نمونه" : "سیستم")}</span>
            </div>
            <div style={{ fontSize: 14 }}>{summary(t)}</div>
            {t.note && <div className={styles.muted}>{t.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
