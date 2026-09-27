"use client";

import { useEffect, useRef, useState } from "react";
import ui from "@/components/ui/ui.module.css";
import { searchHsAction } from "../rates/actions";
import styles from "../panel.module.css";

type Hit = { code: string; titleFa: string | null; duty: string };

// فیلد HS code محصول با جستجو در لیست HS (کد یا شرح). انتخاب از لیست لازم است؛ کد قدیمیِ خارج از لیست دست نمی‌خورد
// ولی برچسب «در لیست نیست» می‌گیرد (ماشین‌حساب برایش «استعلام» نشان می‌دهد).
export function HsPicker({ defaultValue, current, ready }: { defaultValue: string; current: { code: string; titleFa: string | null; duty: string } | null; ready: boolean }) {
  const [value, setValue] = useState(defaultValue);
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState(current);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function onChange(v: string) {
    setValue(v);
    setPicked(null);
    if (!ready) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const my = ++seq.current;
      const r = await searchHsAction(v);
      if (my === seq.current) {
        setHits(r);
        setOpen(true);
      }
    }, 300);
  }

  const status = !value.trim() ? null : picked ? (
    <span className={styles.badge}>
      در لیست: {picked.titleFa ? `${picked.titleFa} · ` : ""}حقوق ورودی {picked.duty}
    </span>
  ) : value === defaultValue && !current && ready ? (
    <span className={`${styles.badge} ${styles.badgeWarn}`}>در لیست HS نیست (ماشین‌حساب: استعلام)</span>
  ) : null;

  return (
    <label className={ui.field} style={{ position: "relative" }}>
      <span className={ui.label}>HS code</span>
      <input
        name="hsCode"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`${ui.input} ${ui.ltr}`}
        maxLength={30}
        autoComplete="off"
        placeholder={ready ? "کد یا شرح را بنویسید" : ""}
        role="combobox"
        aria-expanded={open}
        aria-controls="hs-hits"
      />
      {open && hits.length > 0 && (
        <ul id="hs-hits" role="listbox" className={styles.hsHits}>
          {hits.map((h) => (
            <li key={h.code} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setValue(h.code);
                  setPicked(h);
                  setOpen(false);
                }}
              >
                <span className={styles.num}>{h.code}</span> {h.titleFa} <span className={styles.muted}>· {h.duty}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className={ui.hint}>{ready ? <>از لیست HS انتخاب کنید (بخش نرخ‌ها و هزینه‌ها). {status}</> : "لیست HS بعد از اجرای migration ۰۰۰۵ فعال می‌شود."}</span>
    </label>
  );
}
