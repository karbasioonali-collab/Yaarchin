"use client";
// ورود تاریخ شمسی (با تقویم کوچک). به سرور همان مقدار میلادی قبلی را می‌فرستد (فیلد مخفی):
//   تاریخ: «YYYY-MM-DD»       با ساعت (withTime): «YYYY-MM-DDTHH:MM» (ساعت تهران، مثل input نوع datetime-local)
// پس کد ذخیره و فیلترها عوض نمی‌شود. کاربر می‌تواند تایپ کند (۱۴۰۵/۰۷/۱۵، ارقام فارسی یا لاتین) یا از تقویم بزند.
// docs/infoyaarchin.md بخش ۲۸.
import { useEffect, useId, useRef, useState } from "react";
import { formatJalali, isoToJalali, JALALI_MONTHS, jalaliMonthLength, jalaliToIso, parseJalali, toGregorian } from "@/lib/jalali";
import { tehranYmd } from "@/lib/tehran-time";
import ui from "@/components/ui/ui.module.css";
import s from "./jalali.module.css";

const DOW = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const fa = (n: number) => n.toLocaleString("fa-IR", { useGrouping: false });

export function JalaliDateInput(props: {
  name: string;
  label?: string;
  defaultValue?: string;
  required?: boolean;
  withTime?: boolean;
  min?: string;
  max?: string;
  hint?: string;
  ariaLabel?: string;
  // در نوار فیلتر: بدون برچسب و فاصله‌ی فیلد فرم
  inline?: boolean;
}) {
  const id = useId();
  const [d0, t0] = (props.defaultValue ?? "").split("T");
  const j0 = d0 ? isoToJalali(d0) : null;
  const [text, setText] = useState(j0 ? formatJalali(j0) : "");
  const [time, setTime] = useState((t0 ?? "").slice(0, 5));
  const [open, setOpen] = useState(false);
  const today = tehranYmd();
  const todayJ = isoToJalali(today)!;
  const parsed = text.trim() ? parseJalali(text) : null;
  const iso = parsed ? jalaliToIso(parsed) : "";
  const outOfRange = !!iso && ((props.min && iso < props.min) || (props.max && iso > props.max));
  const invalid = (!!text.trim() && !parsed) || outOfRange;
  const [view, setView] = useState({ jy: (parsed ?? todayJ).jy, jm: (parsed ?? todayJ).jm });
  const ref = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.setCustomValidity(invalid ? (outOfRange ? "این تاریخ مجاز نیست." : "تاریخ شمسی نامعتبر است (مثل ۱۴۰۵/۰۷/۱۵).") : "");
  }, [invalid, outOfRange]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const hidden = iso && !invalid ? (props.withTime ? `${iso}T${time || "00:00"}` : iso) : "";
  const pick = (jd: number) => {
    setText(formatJalali({ jy: view.jy, jm: view.jm, jd }));
    setOpen(false);
    ref.current?.focus();
  };
  const move = (delta: number) =>
    setView((v) => {
      const m = v.jm + delta;
      return m < 1 ? { jy: v.jy - 1, jm: 12 } : m > 12 ? { jy: v.jy + 1, jm: 1 } : { jy: v.jy, jm: m };
    });
  const g1 = toGregorian(view.jy, view.jm, 1);
  const lead = (new Date(Date.UTC(g1.gy, g1.gm - 1, g1.gd)).getUTCDay() + 1) % 7; // شنبه = ۰
  const len = jalaliMonthLength(view.jy, view.jm);

  const control = (
    <div className={s.wrap} ref={box}>
      <input
        ref={ref}
        id={id}
        className={`${ui.input} ${s.text}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => parsed && setText(formatJalali(parsed))}
        placeholder="۱۴۰۵/۰۷/۱۵"
        inputMode="numeric"
        required={props.required}
        aria-label={props.ariaLabel ?? props.label}
        aria-invalid={invalid || undefined}
        autoComplete="off"
      />
      <button
        type="button"
        className={s.btn}
        onClick={() => {
          setView({ jy: (parsed ?? todayJ).jy, jm: (parsed ?? todayJ).jm });
          setOpen((o) => !o);
        }}
        aria-label="تقویم"
        aria-expanded={open}
      >
        📅
      </button>
      {props.withTime && <input type="time" className={`${ui.input} ${s.time}`} value={time} onChange={(e) => setTime(e.target.value)} aria-label="ساعت (تهران)" />}
      <input type="hidden" name={props.name} value={hidden} />
      {open && (
        <div className={s.pop} role="dialog" aria-label="انتخاب تاریخ">
          <div className={s.head}>
            <button type="button" className={s.nav} onClick={() => move(-1)} aria-label="ماه قبل">
              ›
            </button>
            <span>
              {JALALI_MONTHS[view.jm - 1]} {fa(view.jy)}
            </span>
            <button type="button" className={s.nav} onClick={() => move(1)} aria-label="ماه بعد">
              ‹
            </button>
          </div>
          <div className={s.grid}>
            {DOW.map((d) => (
              <span key={d} className={s.dow}>
                {d}
              </span>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {Array.from({ length: len }, (_, i) => {
              const jd = i + 1;
              const dIso = jalaliToIso({ jy: view.jy, jm: view.jm, jd });
              const disabled = (!!props.min && dIso < props.min) || (!!props.max && dIso > props.max);
              const isSel = !!parsed && parsed.jy === view.jy && parsed.jm === view.jm && parsed.jd === jd;
              return (
                <button
                  key={jd}
                  type="button"
                  className={`${s.day} ${dIso === today ? s.today : ""} ${isSel ? s.sel : ""}`}
                  disabled={disabled}
                  onClick={() => pick(jd)}
                  aria-label={`${fa(jd)} ${JALALI_MONTHS[view.jm - 1]} ${fa(view.jy)}`}
                >
                  {fa(jd)}
                </button>
              );
            })}
          </div>
          <div className={s.foot}>
            <button
              type="button"
              className={s.link}
              onClick={() => {
                setView({ jy: todayJ.jy, jm: todayJ.jm });
                setText(formatJalali(todayJ));
                setOpen(false);
              }}
            >
              امروز
            </button>
            {!props.required && (
              <button
                type="button"
                className={s.link}
                onClick={() => {
                  setText("");
                  setOpen(false);
                }}
              >
                پاک کردن
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (props.inline) return control;
  return (
    <div className={ui.field}>
      {props.label && (
        <label className={ui.label} htmlFor={id}>
          {props.label}
        </label>
      )}
      {control}
      {invalid ? (
        <span className={s.err}>{outOfRange ? "این تاریخ مجاز نیست." : "تاریخ شمسی نامعتبر است (مثل ۱۴۰۵/۰۷/۱۵)."}</span>
      ) : (
        props.hint && <span className={ui.hint}>{props.hint}</span>
      )}
    </div>
  );
}
