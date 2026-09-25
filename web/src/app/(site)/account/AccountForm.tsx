"use client";

import { useActionState, type ReactNode } from "react";
import s from "@/components/site/site.module.css";
import { submitWithoutReset } from "@/components/ui/useSubmit";
import styles from "../pages.module.css";
import type { AccountState } from "./actions";

// فرم پنل مشتری با پیام خطا/موفقیت (مقدار فیلدها بعد از ارسال پاک نمی‌شود)
export function AccountForm({
  action,
  submitLabel,
  children,
  clearOnOk = false,
}: {
  action: (prev: AccountState, fd: FormData) => Promise<AccountState>;
  submitLabel: string;
  children: ReactNode;
  // فرم رمز: بعد از موفقیت خالی شود
  clearOnOk?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, null);
  return (
    <form className={styles.form} onSubmit={submitWithoutReset(dispatch)} key={clearOnOk && state?.ok ? "done" : "form"} noValidate>
      {children}
      {state?.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className={styles.notice} role="status">
          {state.ok}
        </p>
      )}
      <button type="submit" className={s.btnGreen} disabled={pending}>
        {pending ? "…" : submitLabel}
      </button>
    </form>
  );
}
