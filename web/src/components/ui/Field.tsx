import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./ui.module.css";

export function Field({
  label,
  hint,
  ltr,
  ...input
}: { label: string; hint?: ReactNode; ltr?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input className={`${styles.input} ${ltr ? styles.ltr : ""}`} {...input} />
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}

export function Checkbox({ label, ...input }: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={styles.checkbox}>
      <input type="checkbox" {...input} />
      <span>{label}</span>
    </label>
  );
}
