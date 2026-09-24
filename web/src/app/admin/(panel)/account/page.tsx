import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import { requireStaff } from "@/lib/auth/current";
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { changeOwnPasswordAction } from "./actions";
import styles from "../panel.module.css";

export const metadata: Metadata = { title: "حساب من" };

export default async function AccountPage() {
  const a = await requireStaff();

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>حساب من</h1>
          <p className={styles.pageSub}>
            {a.user.fullName}
            {a.user.mobile && (
              <>
                {" · "}موبایل: <span className={styles.ltr}>{a.user.mobile}</span>
              </>
            )}
            {a.user.email && (
              <>
                {" · "}ایمیل: <span className={styles.ltr}>{a.user.email}</span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>تغییر رمز</h2>
          <ActionForm action={changeOwnPasswordAction} submitLabel="تغییر رمز">
            <Field label="رمز فعلی" name="current" type="password" autoComplete="current-password" required ltr />
            <Field
              label="رمز جدید"
              name="next"
              type="password"
              autoComplete="new-password"
              required
              ltr
              minLength={PASSWORD_MIN_LENGTH}
              hint={PASSWORD_HINT}
            />
          </ActionForm>
        </div>
      </div>
    </>
  );
}
