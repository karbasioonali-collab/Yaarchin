"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/site/Icon";
import s from "@/components/site/site.module.css";
import { submitWithoutReset } from "@/components/ui/useSubmit";
import styles from "../pages.module.css";
import { type ContactState, sendContactAction } from "./actions";

export function ContactForm({ subjects }: { subjects: string[] }) {
  const [state, action, pending] = useActionState(sendContactAction, null);
  // بعد از «ارسال پیام دیگر» همان نتیجه‌ی موفق دوباره نشان داده نمی‌شود
  const [dismissed, setDismissed] = useState<ContactState>(null);

  if (state?.ok && state !== dismissed) {
    return (
      <div className={styles.success} role="status">
        <span className={styles.successIcon}>
          <Icon name="check" size={32} />
        </span>
        <h2 className={styles.successTitle}>پیام شما با موفقیت ارسال شد</h2>
        <p className={styles.successText}>ممنون از پیامتان. کارشناس‌های یارچین به‌زودی پاسخ می‌دهند.</p>
        <button type="button" className={s.btnGhost} onClick={() => setDismissed(state)}>
          ارسال پیام دیگر
        </button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submitWithoutReset(action)} noValidate>
      <div className={styles.row2}>
        <label className={styles.field}>
          <span className={styles.label}>نام و نام خانوادگی</span>
          <input className={styles.input} name="name" autoComplete="name" required minLength={2} maxLength={80} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>موبایل یا ایمیل</span>
          <input className={`${styles.input} ${s.ltr}`} name="contact" autoComplete="email" inputMode="email" dir="ltr" required maxLength={120} />
        </label>
      </div>
      <label className={styles.field}>
        <span className={styles.label}>موضوع</span>
        <select className={styles.select} name="subject" defaultValue={subjects[0]}>
          {subjects.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>پیام</span>
        <textarea className={styles.textarea} name="message" required minLength={10} maxLength={3000} />
      </label>
      <label className={styles.honey} aria-hidden="true">
        وب‌سایت
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      {state?.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className={s.btn} disabled={pending}>
        {pending ? "در حال ارسال…" : "ارسال پیام"}
        {!pending && <Icon name="send" size={18} />}
      </button>
    </form>
  );
}
