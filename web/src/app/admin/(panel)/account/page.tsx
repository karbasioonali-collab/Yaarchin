import type { Metadata } from "next";
import { count, and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { userRecoveryCodes } from "@/db/schema";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import { requireStaff } from "@/lib/auth/current";
import { fmtNum } from "@/lib/format";
import { changeOwnPasswordAction } from "./actions";
import { RecoveryCodesForm } from "./RecoveryCodesForm";
import styles from "../panel.module.css";

export const metadata: Metadata = { title: "حساب من" };

export default async function AccountPage() {
  const a = await requireStaff();
  const [{ left }] = await db
    .select({ left: count() })
    .from(userRecoveryCodes)
    .where(and(eq(userRecoveryCodes.userId, a.user.id), isNull(userRecoveryCodes.usedAt)));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>حساب من</h1>
          <p className={styles.pageSub}>
            {a.user.fullName} · <span className={styles.ltr}>{a.user.mobile ?? a.user.email}</span>
          </p>
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>تغییر رمز</h2>
          <ActionForm action={changeOwnPasswordAction} submitLabel="تغییر رمز">
            <Field label="رمز فعلی" name="current" type="password" autoComplete="current-password" required ltr />
            <Field label="رمز جدید" name="next" type="password" autoComplete="new-password" required ltr minLength={10} hint="حداقل ۱۰ کاراکتر" />
          </ActionForm>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>کدهای بازیابی</h2>
          {a.user.totpConfirmed ? (
            <>
              <p className={styles.muted} style={{ marginTop: 0 }}>
                {fmtNum(left)} کد استفاده‌نشده باقی مانده. برای ساخت کدهای جدید، کد اپ را وارد کنید.
              </p>
              <RecoveryCodesForm />
            </>
          ) : (
            <p className={styles.muted}>ورود دومرحله‌ای برای حساب شما فعال نیست.</p>
          )}
        </div>
      </div>
    </>
  );
}
