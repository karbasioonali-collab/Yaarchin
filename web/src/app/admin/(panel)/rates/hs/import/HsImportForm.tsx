"use client";

import { useActionState } from "react";
import { Checkbox } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { submitWithoutReset } from "@/components/ui/useSubmit";
import { importHsAction } from "../../actions";
import styles from "../../../panel.module.css";

const STATUS_FA = { new: "تازه", changed: "تغییر", same: "بدون تغییر" } as const;
const fa = (n: number) => n.toLocaleString("fa-IR");

// مرحله‌ی ۱: انتخاب فایل و «پیش‌نمایش» (هیچ چیزی ثبت نمی‌شود). مرحله‌ی ۲: «ثبت» همان فایل (سرور هش را با پیش‌نمایش مقایسه می‌کند).
export function HsImportForm() {
  const [state, action, pending] = useActionState(importHsAction, null);
  const p = state?.preview;
  return (
    <form onSubmit={submitWithoutReset(action)} className={ui.form}>
      <label className={ui.field}>
        <span className={ui.label}>فایل اکسل (.xlsx) یا CSV</span>
        <input type="file" name="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required className={ui.input} />
        <span className={ui.hint}>حداکثر ۴ مگابایت. فقط اولین شیت خوانده می‌شود.</span>
      </label>
      {p && <input type="hidden" name="hash" value={p.hash} />}
      {state?.error && (
        <p className={ui.error} role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className={ui.success} role="status">
          {state.ok}
        </p>
      )}
      <div className={styles.row} style={{ alignItems: "center" }}>
        <button type="submit" name="step" value="preview" className={p ? ui.secondary : ui.primary} disabled={pending}>
          {pending ? "…" : "پیش‌نمایش"}
        </button>
        {p && (
          <button type="submit" name="step" value="commit" className={ui.primary} disabled={pending || p.fresh + p.changed === 0}>
            ثبت {fa(p.fresh + p.changed)} کد
          </button>
        )}
      </div>

      {p && (
        <div role="region" aria-label="پیش‌نمایش">
          <h3 className={styles.groupTitle}>پیش‌نمایش «{p.fileName}» — هنوز چیزی ثبت نشده</h3>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>{fa(p.total)}</div>
              <div className={styles.statLabel}>ردیف درست</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{fa(p.fresh)}</div>
              <div className={styles.statLabel}>کد تازه</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{fa(p.changed)}</div>
              <div className={styles.statLabel}>تغییرکرده (نسخه‌ی تازه)</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{fa(p.same)}</div>
              <div className={styles.statLabel}>بدون تغییر</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{fa(p.errors.length)}</div>
              <div className={styles.statLabel}>ردیف خطادار</div>
            </div>
          </div>
          {p.notInFile > 0 && (
            <p className={styles.muted} style={{ fontSize: 13 }}>
              {fa(p.notInFile)} کدِ لیست فعلی در این فایل نیست؛ آن‌ها دست نمی‌خورند (پاک نمی‌شوند).
            </p>
          )}
          {p.errors.length > 0 && (
            <>
              <h3 className={styles.groupTitle}>خطاها (ردیف‌های خطادار ثبت نمی‌شوند)</h3>
              <ul className={styles.errorList}>
                {p.errors.map((e, i) => (
                  <li key={i}>
                    ردیف {fa(e.line)}: {e.message}
                  </li>
                ))}
              </ul>
              <Checkbox label="ردیف‌های خطادار نادیده گرفته شوند و بقیه ثبت شوند" name="ignoreErrors" />
            </>
          )}
          <h3 className={styles.groupTitle}>{p.sample.length < p.total ? `${fa(p.sample.length)} ردیف اول` : "ردیف‌ها"}</h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ردیف</th>
                  <th>کد</th>
                  <th>شرح</th>
                  <th>حقوق ورودی</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {p.sample.map((r) => (
                  <tr key={r.line}>
                    <td>{fa(r.line)}</td>
                    <td className={styles.num}>{r.code}</td>
                    <td style={{ fontSize: 13 }}>{r.titleFa}</td>
                    <td>{r.duty}</td>
                    <td>
                      <span className={`${styles.badge} ${r.status === "same" ? styles.badgeMuted : r.status === "changed" ? styles.badgeWarn : ""}`}>{STATUS_FA[r.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </form>
  );
}
