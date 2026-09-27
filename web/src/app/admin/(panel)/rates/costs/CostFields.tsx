"use client";

import { useState } from "react";
import { Checkbox, Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { VARIABLES } from "@/lib/pricing/formula";
import { BASE_FA, CALC_TYPE_FA, COST_BASES, METHOD_FA, METHOD_KEYS } from "@/lib/pricing/labels";
import styles from "../../panel.module.css";

export type CostInitial = {
  isActive: boolean;
  calcType: string;
  amount: string | null;
  percentBase: string[] | null;
  formula: string | null;
  currencyCode: string | null;
  methods: string[] | null;
};

// فیلدهای یک نسخه‌ی «بیمه و هزینه‌ها». با عوض کردن «نوع محاسبه» فقط فیلدهای لازم همان نوع نمایش داده می‌شود.
export function CostFields({ currencies, initial }: { currencies: { code: string; nameFa: string }[]; initial?: CostInitial }) {
  const [type, setType] = useState(initial?.calcType ?? "percent");
  const methods = initial?.methods ?? METHOD_KEYS;
  return (
    <>
      <Checkbox label="فعال (در محاسبه حساب شود)" name="isActive" defaultChecked={initial?.isActive ?? true} />
      <label className={ui.field}>
        <span className={ui.label}>نوع محاسبه</span>
        <select name="calcType" value={type} onChange={(e) => setType(e.target.value)} className={ui.select}>
          {Object.entries(CALC_TYPE_FA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>

      {type === "formula" ? (
        <>
          <label className={ui.field}>
            <span className={ui.label}>فرمول</span>
            <input name="formula" defaultValue={initial?.formula ?? ""} className={ui.input} maxLength={500} placeholder="max(۵۰۰۰۰۰، وزن × ۲۰۰۰۰)" required />
            <span className={ui.hint}>
              متغیرها:{" "}
              {Object.values(VARIABLES)
                .map((v) => `${v.fa} (${v.label})`)
                .join("، ")}
              . عملگرها: + − × ÷ و پرانتز؛ تابع‌ها: max، min، ceil، floor، round. نتیجه به ارز همین آیتم است.
            </span>
          </label>
        </>
      ) : (
        <Field
          label={type === "percent" ? "درصد" : type === "fixed" ? "مبلغ (برای کل سفارش)" : type === "per_kg" ? "مبلغ به ازای هر کیلو (وزن واقعی)" : "مبلغ به ازای هر متر مکعب"}
          name="amount"
          defaultValue={initial?.amount === null || initial?.amount === undefined ? "" : String(Number(initial.amount))}
          inputMode="decimal"
          ltr
          required
        />
      )}

      {type === "percent" ? (
        <fieldset className={styles.iconPicker}>
          <legend className={ui.label}>پایه‌ی درصد</legend>
          <div className={styles.checkRow}>
            {COST_BASES.map((b) => (
              <Checkbox key={b} label={BASE_FA[b]} name="percentBase" value={b} defaultChecked={(initial?.percentBase ?? ["goods"]).includes(b)} />
            ))}
          </div>
        </fieldset>
      ) : (
        <label className={ui.field}>
          <span className={ui.label}>ارز مبلغ</span>
          <select name="currency" defaultValue={initial?.currencyCode ?? "IRT"} className={ui.select}>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.nameFa} ({c.code})
              </option>
            ))}
          </select>
        </label>
      )}

      <fieldset className={styles.iconPicker}>
        <legend className={ui.label}>برای کدام روش‌های حمل حساب شود؟</legend>
        <div className={styles.checkRow}>
          {METHOD_KEYS.map((m) => (
            <Checkbox key={m} label={METHOD_FA[m]} name="methods" value={m} defaultChecked={methods.includes(m)} />
          ))}
        </div>
      </fieldset>
      <Field label="معتبر از (اختیاری؛ خالی = همین حالا)" name="validFrom" type="datetime-local" ltr hint="ساعت تهران. برای تغییر زمان‌بندی‌شده، تاریخ آینده بدهید." />
      <Field label="یادداشت (اختیاری)" name="note" maxLength={500} />
    </>
  );
}
