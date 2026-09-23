"use client";

import { submitWithoutReset } from "@/components/ui/useSubmit";
import Link from "next/link";
import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { confirmTwoFactorSetupAction } from "../actions";
import styles from "../auth.module.css";

export function SetupForm() {
  const [state, action, pending] = useActionState(confirmTwoFactorSetupAction, null);

  if (state?.codes) {
    return (
      <div className={ui.form}>
        <p className={ui.success}>{state.ok}</p>
        <p style={{ margin: 0, fontSize: 14 }}>
          <strong>کدهای بازیابی</strong> — همین حالا جایی امن (بیرون از گوشی) یادداشت کنید. هر کد یک بار کار می‌کند و دیگر نمایش داده نمی‌شوند.
        </p>
        <div className={styles.codes}>
          {state.codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <Link href="/admin" className={ui.primary} style={{ textAlign: "center" }}>
          یادداشت کردم، ادامه
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submitWithoutReset(action)} className={ui.form}>
      <Field label="کد ۶ رقمی" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required ltr autoFocus />
      {state?.error && <p className={ui.error}>{state.error}</p>}
      <button type="submit" className={ui.primary} disabled={pending}>
        {pending ? "…" : "فعال‌سازی"}
      </button>
    </form>
  );
}
