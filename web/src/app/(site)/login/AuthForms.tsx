"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/site/Icon";
import s from "@/components/site/site.module.css";
import { submitWithoutReset } from "@/components/ui/useSubmit";
import { CUSTOMER_PASSWORD_HINT, CUSTOMER_PASSWORD_MIN } from "@/lib/customer/password";
import styles from "../pages.module.css";
import { type AuthFormState, customerLoginAction, customerSignupAction, requestSmsCodeAction, smsLoginAction } from "./actions";

function Message({ state }: { state: AuthFormState }) {
  if (state?.error)
    return (
      <p className={styles.error} role="alert">
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p className={styles.notice} role="status">
        {state.ok}
      </p>
    );
  return null;
}

function Submit({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button type="submit" className={s.btn} disabled={pending}>
      {pending ? "…" : label}
    </button>
  );
}

export function LoginForm({ next, smsOn }: { next: string; smsOn: boolean }) {
  const [state, action, pending] = useActionState(customerLoginAction, null);
  const [sms, setSms] = useState(false);
  if (sms) return <SmsLoginForm next={next} onBack={() => setSms(false)} />;
  return (
    <form className={styles.form} onSubmit={submitWithoutReset(action)} noValidate>
      <input type="hidden" name="next" value={next} />
      <label className={styles.field}>
        <span className={styles.label}>موبایل یا ایمیل</span>
        <input className={`${styles.input} ${s.ltr}`} name="identifier" autoComplete="username" inputMode="email" dir="ltr" required maxLength={120} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>رمز عبور</span>
        <input className={`${styles.input} ${s.ltr}`} name="password" type="password" autoComplete="current-password" dir="ltr" required maxLength={128} />
      </label>
      <Message state={state} />
      <Submit pending={pending} label="ورود" />
      {smsOn && (
        <button type="button" className={s.btnGhost} onClick={() => setSms(true)}>
          <Icon name="phone" size={18} />
          ورود با کد پیامکی
        </button>
      )}
    </form>
  );
}

function SmsLoginForm({ next, onBack }: { next: string; onBack: () => void }) {
  const [reqState, reqAction, reqPending] = useActionState(requestSmsCodeAction, null);
  const [state, action, pending] = useActionState(smsLoginAction, null);
  const [mobile, setMobile] = useState("");
  // وقتی یک بار کد فرستاده شد، فیلد کد می‌ماند (حتی اگر «ارسال دوباره» خطای یک دقیقه صبر کنید بدهد)
  const [codeSent, setCodeSent] = useState(false);
  if (reqState?.step === "code" && !codeSent) setCodeSent(true);
  const codeStep = codeSent;
  return (
    <div className={styles.form}>
      <form className={styles.form} onSubmit={submitWithoutReset(reqAction)} noValidate>
        <label className={styles.field}>
          <span className={styles.label}>موبایل</span>
          <input
            className={`${styles.input} ${s.ltr}`}
            name="mobile"
            autoComplete="tel"
            inputMode="tel"
            dir="ltr"
            required
            maxLength={20}
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </label>
        <Message state={reqState} />
        <button type="submit" className={codeStep ? s.btnGhost : s.btn} disabled={reqPending}>
          {reqPending ? "…" : codeStep ? "ارسال دوباره‌ی کد" : "دریافت کد"}
        </button>
      </form>
      {codeStep && (
        <form className={styles.form} onSubmit={submitWithoutReset(action)} noValidate>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="mobile" value={mobile} />
          <label className={styles.field}>
            <span className={styles.label}>کد ۶ رقمی</span>
            <input className={`${styles.input} ${s.ltr}`} name="code" autoComplete="one-time-code" inputMode="numeric" dir="ltr" required maxLength={6} />
          </label>
          <Message state={state} />
          <Submit pending={pending} label="ورود" />
        </form>
      )}
      <button type="button" className={s.btnGhost} onClick={onBack}>
        ورود با رمز عبور
      </button>
    </div>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(customerSignupAction, null);
  return (
    <form className={styles.form} onSubmit={submitWithoutReset(action)} noValidate>
      <input type="hidden" name="next" value={next} />
      <label className={styles.field}>
        <span className={styles.label}>نام و نام خانوادگی</span>
        <input className={styles.input} name="fullName" autoComplete="name" required minLength={2} maxLength={80} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>موبایل یا ایمیل</span>
        <input className={`${styles.input} ${s.ltr}`} name="identifier" autoComplete="username" inputMode="email" dir="ltr" required maxLength={120} />
        <span className={styles.hint}>یکی کافی است؛ دیگری را بعداً در «حساب من» اضافه کنید.</span>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>رمز عبور</span>
        <input
          className={`${styles.input} ${s.ltr}`}
          name="password"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          required
          minLength={CUSTOMER_PASSWORD_MIN}
          maxLength={128}
        />
        <span className={styles.hint}>{CUSTOMER_PASSWORD_HINT}</span>
      </label>
      <label className={styles.honey} aria-hidden="true">
        وب‌سایت
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <Message state={state} />
      <Submit pending={pending} label="ثبت‌نام" />
    </form>
  );
}
