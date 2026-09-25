import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/site/Icon";
import s from "@/components/site/site.module.css";
import { getAuth } from "@/lib/auth/current";
import { isCustomer } from "@/lib/customer/auth";
import { smsLoginAvailable } from "@/lib/customer/otp";
import { isEnabled } from "@/lib/settings";
import { safeNext } from "@/lib/site/safe-next";
import styles from "../pages.module.css";
import { LoginForm, SignupForm } from "./AuthForms";

export const metadata: Metadata = { title: "ورود و ثبت‌نام", robots: { index: false } };

// ورود و ثبت‌نام مشتری. ?next= صفحه‌ای است که بعد از ورود به آن برمی‌گردد (فقط مسیرهای مجاز؛ lib/site/safe-next.ts).
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const a = await getAuth();
  if (a && isCustomer(a.user)) redirect(next);
  const [signupOn, smsOn] = await Promise.all([isEnabled("customer_signup"), smsLoginAvailable()]);
  const mode = sp.mode === "signup" ? "signup" : "login";
  const tab = (m: "login" | "signup") => `/login?${new URLSearchParams({ ...(m === "signup" && { mode: m }), ...(next !== "/" && { next }) })}`;

  return (
    <div className={s.container}>
      <div className={styles.authCard}>
        <div className={styles.authIcon}>
          <Icon name="user" size={30} />
        </div>
        <h1 className={styles.authTitle}>{mode === "signup" ? "ثبت‌نام در یارچین" : "ورود به یارچین"}</h1>
        <p className={styles.authText}>ذخیره‌ی محصولات، دیدن بازدیدهای اخیر و به‌زودی گفتگو با دستیار یارچین.</p>

        <nav className={styles.tabs} aria-label="ورود یا ثبت‌نام">
          <Link href={tab("login")} className={`${styles.tab} ${mode === "login" ? styles.tabActive : ""}`} aria-current={mode === "login" ? "page" : undefined}>
            ورود
          </Link>
          <Link href={tab("signup")} className={`${styles.tab} ${mode === "signup" ? styles.tabActive : ""}`} aria-current={mode === "signup" ? "page" : undefined}>
            ثبت‌نام
          </Link>
        </nav>

        {a?.user.isStaff && (
          <p className={styles.notice}>
            در این مرورگر با حساب پنل ({a.user.fullName}) وارد شده‌اید. ورود با حساب مشتری، از پنل خارجتان می‌کند.
          </p>
        )}

        <div className={styles.authBody}>
          {mode === "login" ? (
            <LoginForm next={next} smsOn={smsOn} />
          ) : signupOn ? (
            <SignupForm next={next} />
          ) : (
            <p className={styles.notice}>ثبت‌نام فعلاً بسته است. اگر قبلاً ثبت‌نام کرده‌اید، از «ورود» استفاده کنید.</p>
          )}
        </div>

        <Link href={next} className={styles.backLink}>
          بازگشت
        </Link>
      </div>
    </div>
  );
}
