"use client";
// فیلد «آدرس عکس» + دکمه‌ی آپلود (کامپیوتر/گالری، و دوربین در گوشی). مقدار فیلد بعد از آپلود کلید فایل می‌شود
// (مثل img/2026/10/…) و با فرم اصلی ذخیره می‌شود؛ وارد کردن آدرس https دستی هم مثل قبل کار می‌کند.
import { useState } from "react";
import ui from "@/components/ui/ui.module.css";
import styles from "./media.module.css";
import { IMAGE_ACCEPT, uploadFile } from "./upload-client";

export function UploadImageField(props: {
  name: string;
  label: string;
  defaultValue?: string;
  previewUrl?: string | null;
  purpose: "category" | "slide" | "poster";
  hint?: string;
  uploadEnabled: boolean;
  maxLength?: number;
}) {
  const [value, setValue] = useState(props.defaultValue ?? "");
  const [preview, setPreview] = useState<string | null>(props.previewUrl ?? null);
  const [state, setState] = useState<{ busy?: number; error?: string; ok?: string }>({});

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setState({ busy: 0 });
    const r = await uploadFile(file, { purpose: props.purpose }, (f) => setState({ busy: f }));
    if (!r.ok) return setState({ error: r.error });
    setValue(r.key);
    setPreview(r.url);
    setState({ ok: "آپلود شد؛ برای ثبت، فرم را ذخیره کنید." });
  }

  const busy = state.busy !== undefined;
  return (
    <div className={ui.field}>
      <span className={ui.label}>{props.label}</span>
      <div className={styles.fieldRow}>
        <div className={ui.field}>
          <input
            className={`${ui.input} ${ui.ltr}`}
            name={props.name}
            value={value}
            maxLength={props.maxLength ?? 1000}
            placeholder="https://…"
            onChange={(e) => {
              setValue(e.target.value);
              setPreview(/^https:\/\//.test(e.target.value) ? e.target.value : null);
            }}
          />
          {props.uploadEnabled && (
            <div className={styles.pickRow}>
              <label className={styles.pick} aria-disabled={busy}>
                ⬆ آپلود عکس
                <input type="file" accept={IMAGE_ACCEPT} onChange={onPick} disabled={busy} aria-label={`آپلود ${props.label}`} />
              </label>
              <label className={`${styles.pick} ${styles.camera}`} aria-disabled={busy}>
                📷 دوربین
                <input type="file" accept="image/*" capture="environment" onChange={onPick} disabled={busy} aria-label={`عکس با دوربین برای ${props.label}`} />
              </label>
              {busy && <span className={styles.status}>در حال آپلود… {Math.round((state.busy ?? 0) * 100)}٪</span>}
              {state.error && (
                <span className={styles.statusErr} role="alert">
                  {state.error}
                </span>
              )}
              {state.ok && <span className={styles.statusOk}>{state.ok}</span>}
            </div>
          )}
          {props.hint && <span className={ui.hint}>{props.hint}</span>}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview} alt="" className={styles.preview} referrerPolicy="no-referrer" />}
      </div>
    </div>
  );
}
