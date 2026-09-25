import Link from "next/link";
import s from "@/components/site/site.module.css";
import styles from "./pages.module.css";

export default function NotFound() {
  return (
    <div className={s.container}>
      <div className={styles.authCard}>
        <h1 className={styles.authTitle}>صفحه پیدا نشد</h1>
        <p className={styles.authText}>ممکن است این محصول یا دسته حذف یا منتقل شده باشد.</p>
        <div className={styles.authActions}>
          <Link href="/" className={s.btn}>
            صفحه‌ی اصلی
          </Link>
          <Link href="/categories" className={s.btnGhost}>
            دسته‌بندی‌ها
          </Link>
        </div>
      </div>
    </div>
  );
}
