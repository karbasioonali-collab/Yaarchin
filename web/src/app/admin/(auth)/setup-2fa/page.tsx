import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getAuth } from "@/lib/auth/current";
import { otpauthUri } from "@/lib/auth/totp";
import { getOrCreatePendingSecret } from "@/lib/auth/two-factor";
import styles from "../auth.module.css";
import { SetupForm } from "./SetupForm";

export const metadata: Metadata = { title: "راه‌اندازی ورود دومرحله‌ای" };

export default async function SetupTwoFactorPage() {
  const a = await getAuth();
  if (!a || !a.user.isStaff) redirect("/admin/login");
  if (a.user.totpConfirmed) redirect(a.session.twoFactorVerifiedAt ? "/admin" : "/admin/login/2fa");

  const secret = await getOrCreatePendingSecret(a.user.id);
  const account = a.user.mobile ?? a.user.email ?? a.user.fullName;
  const svg = await QRCode.toString(otpauthUri(secret, account), {
    type: "svg",
    margin: 1,
    color: { dark: "#1B4D3E", light: "#FFFFFF" },
  });

  return (
    <>
      <h1 className={styles.title}>راه‌اندازی ورود دومرحله‌ای</h1>
      <p className={styles.subtitle}>
        برای نقش شما اجباری است. در اپ Google Authenticator (یا مشابه) این کد QR را اسکن کنید و بعد کد ۶ رقمی را وارد کنید.
      </p>
      <div className={styles.qr} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className={styles.secret} title="اگر اسکن ممکن نیست، این کلید را دستی وارد کنید">
        {secret.match(/.{1,4}/g)?.join(" ")}
      </div>
      <SetupForm />
    </>
  );
}
