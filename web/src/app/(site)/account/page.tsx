import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import s from "@/components/site/site.module.css";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { topCategoryOptions } from "@/lib/catalog/public";
import { requireCustomer } from "@/lib/customer/auth";
import { CUSTOMER_PASSWORD_HINT, CUSTOMER_PASSWORD_MIN } from "@/lib/customer/password";
import { BUSINESS_TYPE_FA, getProfile } from "@/lib/customer/profile";
import { customerReady } from "@/lib/db-ready";
import styles from "./account.module.css";
import f from "../pages.module.css";
import { AccountForm } from "./AccountForm";
import { AccountShell } from "./AccountShell";
import {
  changePasswordAction,
  customerLogoutAction,
  logoutEverywhereAction,
  saveBusinessProfileAction,
  updateAccountAction,
} from "./actions";

export const metadata: Metadata = { title: "حساب من", robots: { index: false } };

export default async function AccountPage() {
  const a = await requireCustomer("/account");
  const [[me], profile, categories, ready] = await Promise.all([
    db.select({ fullName: users.fullName, mobile: users.mobile, email: users.email }).from(users).where(eq(users.id, a.user.id)),
    getProfile(a.user.id),
    topCategoryOptions(),
    customerReady(),
  ]);
  const imp = profile.hasImportExperience === true ? "yes" : profile.hasImportExperience === false ? "no" : "";

  return (
    <AccountShell title="حساب من" name={me.fullName}>
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>مشخصات</h2>
          <p className={styles.cardSub}>با موبایل یا ایمیل (هر کدام که ثبت کرده‌اید) وارد می‌شوید.</p>
          <AccountForm action={updateAccountAction} submitLabel="ذخیره‌ی مشخصات">
            <label className={f.field}>
              <span className={f.label}>نام و نام خانوادگی</span>
              <input className={f.input} name="fullName" defaultValue={me.fullName} autoComplete="name" required maxLength={80} />
            </label>
            <label className={f.field}>
              <span className={f.label}>موبایل</span>
              <input className={`${f.input} ${s.ltr}`} name="mobile" defaultValue={me.mobile ?? ""} autoComplete="tel" inputMode="tel" dir="ltr" maxLength={20} />
            </label>
            <label className={f.field}>
              <span className={f.label}>ایمیل</span>
              <input className={`${f.input} ${s.ltr}`} name="email" defaultValue={me.email ?? ""} autoComplete="email" inputMode="email" dir="ltr" maxLength={120} />
            </label>
            <label className={f.field}>
              <span className={f.label}>رمز فعلی</span>
              <input className={`${f.input} ${s.ltr}`} name="currentPassword" type="password" autoComplete="current-password" dir="ltr" maxLength={128} />
              <span className={f.hint}>فقط اگر موبایل یا ایمیل را عوض می‌کنید.</span>
            </label>
          </AccountForm>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>پروفایل کسب‌وکار</h2>
          <p className={styles.cardSub}>اختیاری است؛ کمک می‌کند پیشنهادهای مناسب‌تری بگیرید.</p>
          {ready ? (
            <AccountForm action={saveBusinessProfileAction} submitLabel="ذخیره‌ی پروفایل">
              <label className={f.field}>
                <span className={f.label}>نوع فعالیت</span>
                <select className={f.select} name="businessType" defaultValue={profile.businessType ?? ""}>
                  <option value="">انتخاب نشده</option>
                  {Object.entries(BUSINESS_TYPE_FA).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className={f.field}>
                <span className={f.label}>شهر</span>
                <input className={f.input} name="city" defaultValue={profile.city ?? ""} autoComplete="address-level2" maxLength={60} />
              </label>
              <fieldset className={f.field} style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className={f.label} style={{ marginBottom: 6 }}>
                  سابقه‌ی واردات
                </legend>
                <div className={styles.radios}>
                  {[
                    ["yes", "دارم"],
                    ["no", "ندارم"],
                    ["", "نمی‌گویم"],
                  ].map(([v, l]) => (
                    <label key={v} className={styles.check}>
                      <input type="radio" name="importExperience" value={v} defaultChecked={imp === v} />
                      <span>{l}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {categories.length > 0 && (
                <fieldset className={f.field} style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className={f.label} style={{ marginBottom: 6 }}>
                    دسته‌بندی‌های مورد علاقه
                  </legend>
                  <div className={styles.checks}>
                    {categories.map((c) => (
                      <label key={c.id} className={styles.check}>
                        <input type="checkbox" name="interests" value={c.id} defaultChecked={profile.interestIds.includes(c.id)} />
                        <span>{c.nameFa}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </AccountForm>
          ) : (
            <p className={f.notice}>این بخش به‌زودی فعال می‌شود.</p>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>تغییر رمز</h2>
          <p className={styles.cardSub}>بعد از تغییر رمز، دستگاه‌های دیگر از حسابتان خارج می‌شوند.</p>
          <AccountForm action={changePasswordAction} submitLabel="تغییر رمز" clearOnOk>
            <label className={f.field}>
              <span className={f.label}>رمز فعلی</span>
              <input className={`${f.input} ${s.ltr}`} name="currentPassword" type="password" autoComplete="current-password" dir="ltr" required maxLength={128} />
            </label>
            <label className={f.field}>
              <span className={f.label}>رمز جدید</span>
              <input
                className={`${f.input} ${s.ltr}`}
                name="newPassword"
                type="password"
                autoComplete="new-password"
                dir="ltr"
                required
                minLength={CUSTOMER_PASSWORD_MIN}
                maxLength={128}
              />
              <span className={f.hint}>{CUSTOMER_PASSWORD_HINT}</span>
            </label>
          </AccountForm>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>خروج</h2>
          <p className={styles.cardSub}>اگر روی دستگاه دیگری وارد شده‌اید و به آن دسترسی ندارید، از همه‌ی دستگاه‌ها خارج شوید.</p>
          <div className={styles.actionsRow}>
            <form action={customerLogoutAction}>
              <button type="submit" className={s.btnGhost}>
                خروج
              </button>
            </form>
            <form action={logoutEverywhereAction}>
              <button type="submit" className={`${s.btnGhost} ${styles.danger}`}>
                خروج از همه‌ی دستگاه‌ها
              </button>
            </form>
          </div>
        </section>
      </div>
    </AccountShell>
  );
}
