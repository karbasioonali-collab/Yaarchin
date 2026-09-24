import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import { getAuth } from "@/lib/auth/current";
import { loginAction } from "../actions";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "ورود به پنل" };

export default async function LoginPage() {
  const a = await getAuth();
  if (a?.user.isStaff) redirect("/admin");

  return (
    <>
      <h1 className={styles.title}>ورود به پنل</h1>
      <p className={styles.subtitle}>ادمین و کارشناس</p>
      <ActionForm action={loginAction} submitLabel="ورود">
        <Field
          label="موبایل یا ایمیل"
          name="identifier"
          autoComplete="username"
          required
          ltr
          inputMode="email"
          hint="هر کدام که برای حسابتان ثبت شده."
        />
        <Field label="رمز عبور" name="password" type="password" autoComplete="current-password" required ltr />
      </ActionForm>
    </>
  );
}
