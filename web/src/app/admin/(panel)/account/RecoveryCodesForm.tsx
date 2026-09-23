"use client";

import { submitWithoutReset } from "@/components/ui/useSubmit";
import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { regenerateCodesAction } from "./actions";

export function RecoveryCodesForm() {
  const [state, action, pending] = useActionState(regenerateCodesAction, null);
  return (
    <form onSubmit={submitWithoutReset(action)} className={ui.form}>
      {state?.codes ? (
        <>
          <p className={ui.success}>{state.ok}</p>
          <div dir="ltr" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontFamily: "ui-monospace, monospace", textAlign: "center" }}>
            {state.codes.map((c) => (
              <span key={c} style={{ background: "var(--bg)", borderRadius: 10, padding: 8 }}>{c}</span>
            ))}
          </div>
        </>
      ) : (
        <>
          <Field label="کد ۶ رقمی اپ" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required ltr />
          {state?.error && <p className={ui.error}>{state.error}</p>}
          <button type="submit" className={ui.secondary} disabled={pending}>
            {pending ? "…" : "ساخت کدهای جدید"}
          </button>
        </>
      )}
    </form>
  );
}
