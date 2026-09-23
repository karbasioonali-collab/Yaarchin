"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import { verifyTwoFactorAction } from "../../actions";
import styles from "../../auth.module.css";

export function TwoFactorForm() {
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  return (
    <>
      <ActionForm key={mode} action={verifyTwoFactorAction} submitLabel="تأیید">
        <input type="hidden" name="mode" value={mode} />
        {mode === "totp" ? (
          <Field
            label="کد ۶ رقمی اپ Authenticator"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9۰-۹ ]{6,7}"
            maxLength={7}
            required
            ltr
            autoFocus
          />
        ) : (
          <Field label="کد بازیابی" name="code" autoComplete="off" required ltr autoFocus hint="هر کد فقط یک بار قابل استفاده است." />
        )}
      </ActionForm>
      <div className={styles.links}>
        <button type="button" className={styles.linkButton} onClick={() => setMode(mode === "totp" ? "recovery" : "totp")}>
          {mode === "totp" ? "به گوشی دسترسی ندارم (کد بازیابی)" : "ورود با کد اپ"}
        </button>
      </div>
    </>
  );
}
