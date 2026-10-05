import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/ActionForm";
import { Checkbox, Field } from "@/components/ui/Field";
import { requireStaff } from "@/lib/auth/current";
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { staffNotificationPrefs } from "@/db/schema";
import { followupReady } from "@/lib/db-ready";
import { changeOwnPasswordAction, setOwnSmsAlertsAction } from "./actions";
import styles from "../panel.module.css";

export const metadata: Metadata = { title: "حساب من" };

export default async function AccountPage() {
  const a = await requireStaff();
  const smsReady = await followupReady();
  const [pref] = smsReady ? await db.select().from(staffNotificationPrefs).where(eq(staffNotificationPrefs.userId, a.user.id)) : [];

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
        {smsReady && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>پیامک هشدار گفتگو</h2>
            <p className={styles.muted} style={{ marginTop: -6, fontSize: 13 }}>
              گفتگوی تازه‌ی ارجاع‌نشده (اگر ارجاع می‌دهید)، ارجاع گفتگو به شما و یادآوری پیام بی‌پاسخ مشتری؛ فقط در ساعت کاری.
              {!a.user.mobile && <strong> برای حساب شما موبایل ثبت نشده؛ تا ثبت نشود پیامکی نمی‌رسد.</strong>}
            </p>
            <ActionForm action={setOwnSmsAlertsAction} submitLabel="ذخیره" submitVariant="secondary">
              <Checkbox label="پیامک هشدار گفتگو برای من فرستاده شود" name="smsEnabled" defaultChecked={pref?.smsEnabled ?? true} />
            </ActionForm>
          </div>
        )}
      </div>
    </>
  );
}
