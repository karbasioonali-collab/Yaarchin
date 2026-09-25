import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/site/Icon";
import s from "@/components/site/site.module.css";
import styles from "../pages.module.css";

export const metadata: Metadata = { title: "ورود و ثبت‌نام", robots: { index: false } };

// «بازگشت» فقط به صفحه‌هایی که واقعاً وجود دارند؛ هر چیز دیگری (مسیر ناموجود مثل /favorites، آدرس بیرونی
// یا //evil.com) ← صفحه‌ی اصلی. صفحه‌ی تازه‌ای که ساخته شد (مثلاً علاقه‌مندی در مرحله‌ی ۵) را اینجا اضافه کن.
const BACK_ALLOWED = [/^\/$/, /^\/categories$/, /^\/about$/, /^\/contact$/, /^\/c\/[a-z0-9-]+$/, /^\/p\/[a-z0-9-]+$/];

function safeBack(next: unknown): string {
  return typeof next === "string" && BACK_ALLOWED.some((re) => re.test(next)) ? next : "/";
}

// صفحه‌ی موقت: ثبت‌نام و ورود مشتری در مرحله‌ی ۵ ساخته می‌شود.
// next (صفحه‌ای که کاربر از آن آمده) از الان گرفته می‌شود تا بعداً بعد از ورود به همان‌جا برگردد.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const back = safeBack((await searchParams).next);
  return (
    <div className={s.container}>
      <div className={styles.authCard}>
        <div className={styles.authIcon}>
          <Icon name="user" size={30} />
        </div>
        <h1 className={styles.authTitle}>ورود و ثبت‌نام</h1>
        <p className={styles.authText}>
          ثبت‌نام مشتری به‌زودی فعال می‌شود. بعد از آن می‌توانید محصولات را ذخیره کنید، با دستیار یارچین گفتگو کنید و پیشنهاد قیمت بگیرید.
          تا آن موقع برای استعلام، از فرم تماس با ما استفاده کنید.
        </p>
        <div className={styles.authActions}>
          <Link href="/contact" className={s.btn}>
            تماس با ما
          </Link>
          <Link href={back} className={s.btnGhost}>
            بازگشت
          </Link>
        </div>
      </div>
    </div>
  );
}
