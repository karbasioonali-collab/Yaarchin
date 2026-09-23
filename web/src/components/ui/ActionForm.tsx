"use client";

import { useActionState, type ReactNode } from "react";
import styles from "./ui.module.css";
import { submitWithoutReset } from "./useSubmit";

export type FormState = { error?: string; ok?: string } | null;
export type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

// فرم عمومی با پیام خطا/موفقیت. action سمت سرور اجرا می‌شود.
export function ActionForm({
  action,
  children,
  submitLabel,
  submitVariant = "primary",
  className,
  confirm: confirmText,
}: {
  action: FormAction;
  children?: ReactNode;
  submitLabel: string;
  submitVariant?: "primary" | "secondary" | "danger";
  className?: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form className={className ?? styles.form} onSubmit={submitWithoutReset(formAction, confirmText)}>
      {children}
      {state?.error && <p className={styles.error} role="alert">{state.error}</p>}
      {state?.ok && <p className={styles.success} role="status">{state.ok}</p>}
      <button type="submit" className={styles[submitVariant]} disabled={pending}>
        {pending ? "…" : submitLabel}
      </button>
    </form>
  );
}
