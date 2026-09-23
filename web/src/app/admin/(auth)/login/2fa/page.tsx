import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/current";
import { logoutAction } from "../../actions";
import styles from "../../auth.module.css";
import { TwoFactorForm } from "./TwoFactorForm";

export const metadata: Metadata = { title: "ورود دومرحله‌ای" };

export default async function TwoFactorPage() {
  const a = await getAuth();
  if (!a) redirect("/admin/login");
  if (!a.user.totpConfirmed) redirect("/admin/setup-2fa");
  if (a.session.twoFactorVerifiedAt) redirect("/admin");

  return (
    <>
      <h1 className={styles.title}>ورود دومرحله‌ای</h1>
      <p className={styles.subtitle}>{a.user.fullName}</p>
      <TwoFactorForm />
      <form action={logoutAction} className={styles.links}>
        <button type="submit" className={styles.linkButton}>ورود با حساب دیگر</button>
      </form>
    </>
  );
}
