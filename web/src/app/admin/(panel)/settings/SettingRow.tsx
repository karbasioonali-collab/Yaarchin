"use client";

import { submitWithoutReset } from "@/components/ui/useSubmit";
import { useActionState, useRef } from "react";
import ui from "@/components/ui/ui.module.css";
import { saveSettingAction } from "./actions";
import styles from "../panel.module.css";

export function SettingRow({
  settingKey,
  label,
  description,
  value,
  notBuilt = false,
  adminOnly = false,
}: {
  settingKey: string;
  label: string;
  description: string | null;
  value: unknown;
  // هنوز هیچ کدی این تنظیم را نمی‌خواند (src/lib/settings-meta.ts)
  notBuilt?: boolean;
  // فقط ادمین می‌تواند عوضش کند؛ برای بقیه غیرفعال (سرور هم رد می‌کند)
  adminOnly?: boolean;
}) {
  const [state, action, pending] = useActionState(saveSettingAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const isBool = typeof value === "boolean";
  const isObj = !!value && typeof value === "object";
  const obj = (isObj ? value : {}) as { provider?: string; model?: string };

  return (
    <form ref={formRef} onSubmit={submitWithoutReset(action)} className={styles.switchRow}>
      <input type="hidden" name="key" value={settingKey} />
      <div style={{ minWidth: 0 }}>
        <div>
          {label}
          {notBuilt && <span className={`${styles.badge} ${styles.badgeWarn}`} style={{ marginInlineStart: 8 }}>هنوز ساخته نشده</span>}
          {adminOnly && <span className={styles.badge} style={{ marginInlineStart: 8 }}>فقط ادمین</span>}
        </div>
        {notBuilt && <div className={styles.switchDesc}>{isBool ? "روشن یا خاموش کردنش" : "تغییرش"} فعلاً اثری ندارد؛ با ساخته شدن این بخش فعال می‌شود.</div>}
        {description && <div className={styles.switchDesc}>{description}</div>}
        <div className={`${styles.switchDesc} ${styles.mono}`} dir="ltr" style={{ textAlign: "right" }}>
          {settingKey}
        </div>
        {state?.error && <div className={ui.error} style={{ marginTop: 6 }}>{state.error}</div>}
        {state?.ok && !isBool && <div className={styles.switchDesc}>✓ {state.ok}</div>}
      </div>

      {isBool ? (
        <input
          type="checkbox"
          name="value"
          role="switch"
          aria-label={label}
          className={ui.toggle}
          defaultChecked={value}
          disabled={pending || adminOnly}
          onChange={() => formRef.current?.requestSubmit()}
        />
      ) : isObj ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <input name="provider" defaultValue={obj.provider ?? ""} placeholder="provider" dir="ltr" className={ui.input} style={{ width: 130 }} />
          <input name="model" defaultValue={obj.model ?? ""} placeholder="model" dir="ltr" className={ui.input} style={{ width: 180 }} />
          <button type="submit" className={ui.secondary} disabled={pending}>ذخیره</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input name="value" defaultValue={String(value ?? "")} dir="ltr" className={ui.input} style={{ width: 110 }} />
          <button type="submit" className={ui.secondary} disabled={pending}>ذخیره</button>
        </div>
      )}
    </form>
  );
}
