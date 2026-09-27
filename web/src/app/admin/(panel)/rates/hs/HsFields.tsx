"use client";

import { useState } from "react";
import { Checkbox, Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { BASE_FA, DUTY_BASES, FIXED_PER_FA } from "@/lib/pricing/labels";
import styles from "../../panel.module.css";

export type HsInitial = {
  code: string;
  titleFa: string | null;
  isActive: boolean;
  dutyType: string;
  dutyValue: string;
  dutyBase: string[] | null;
  dutyCurrency: string | null;
  fixedPer: string | null;
};

// فیلدهای ثبت/ویرایش یک HS code (ویرایش = نسخه‌ی تازه). نوع «درصد» پایه می‌خواهد و نوع «مبلغ ثابت» ارز و «به ازای».
export function HsFields({ currencies, initial, lockCode = false }: { currencies: { code: string; nameFa: string }[]; initial?: HsInitial; lockCode?: boolean }) {
  const [type, setType] = useState(initial?.dutyType ?? "percent");
  return (
    <>
      {lockCode ? (
        <input type="hidden" name="code" value={initial?.code} />
      ) : (
        <Field
          label="HS code"
          name="code"
          defaultValue={initial?.code ?? ""}
          ltr
          maxLength={30}
          placeholder="85094000"
          required
          hint="۴ تا ۱۲ رقم؛ نقطه و فاصله خودکار حذف می‌شود."
        />
      )}
      <Field label="شرح کالا" name="titleFa" defaultValue={initial?.titleFa ?? ""} maxLength={500} />
      <div className={styles.row}>
        <label className={ui.field}>
          <span className={ui.label}>نوع حقوق ورودی</span>
          <select name="dutyType" value={type} onChange={(e) => setType(e.target.value)} className={ui.select}>
            <option value="percent">درصد</option>
            <option value="fixed">مبلغ ثابت</option>
          </select>
        </label>
        <Field label={type === "percent" ? "درصد" : "مبلغ"} name="dutyValue" defaultValue={initial ? String(Number(initial.dutyValue)) : ""} inputMode="decimal" ltr required />
      </div>
      {type === "percent" ? (
        <fieldset className={styles.iconPicker}>
          <legend className={ui.label}>پایه‌ی محاسبه</legend>
          <div className={styles.checkRow}>
            {DUTY_BASES.map((b) => (
              <Checkbox key={b} label={BASE_FA[b]} name="dutyBase" value={b} defaultChecked={(initial?.dutyBase ?? DUTY_BASES).includes(b)} />
            ))}
          </div>
          <span className={ui.hint}>پیش‌فرض گمرک: کالا + حمل + بیمه و هزینه‌ها (ارزش CIF).</span>
        </fieldset>
      ) : (
        <div className={styles.row}>
          <label className={ui.field}>
            <span className={ui.label}>ارز مبلغ</span>
            <select name="dutyCurrency" defaultValue={initial?.dutyCurrency ?? "IRT"} className={ui.select}>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.nameFa} ({c.code})
                </option>
              ))}
            </select>
          </label>
          <label className={ui.field}>
            <span className={ui.label}>به ازای</span>
            <select name="fixedPer" defaultValue={initial?.fixedPer ?? "unit"} className={ui.select}>
              {Object.entries(FIXED_PER_FA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <Checkbox label="فعال (در لیست HS)" name="isActive" defaultChecked={initial?.isActive ?? true} />
      <Field label="معتبر از (اختیاری؛ خالی = همین حالا)" name="validFrom" type="datetime-local" ltr hint="ساعت تهران." />
      <Field label="یادداشت (اختیاری)" name="note" maxLength={500} />
    </>
  );
}
