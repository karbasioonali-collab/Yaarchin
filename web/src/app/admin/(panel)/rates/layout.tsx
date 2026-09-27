import { requireAnyPermission } from "@/lib/auth/can";
import { ratesReady } from "@/lib/db-ready";
import { RATE_PERMS } from "@/lib/pricing/labels";
import styles from "../panel.module.css";
import { RatesTabs } from "./RatesTabs";

// بخش «نرخ‌ها و هزینه‌ها»: دیدن با هر کدام از rates.enter، costs.manage یا hs.manage؛ فرم‌های هر صفحه دسترسی خودشان را دارند.
export default async function RatesLayout({ children }: LayoutProps<"/admin/rates">) {
  await requireAnyPermission(RATE_PERMS);
  if (!(await ratesReady())) {
    return (
      <div className={styles.impersonation}>
        جدول‌های نرخ‌ها (migration ۰۰۰۵) هنوز ساخته نشده‌اند. در کنسول لیارا اول بکاپ بگیرید، بعد npm run db:migrate و npm run db:seed را اجرا کنید.
      </div>
    );
  }
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>نرخ‌ها و هزینه‌ها</h1>
          <p className={styles.pageSub}>هر تغییر یک نسخه‌ی تازه با تاریخ است و قبلی‌ها پاک نمی‌شوند. قیمت‌های سایت هر بار با آخرین نسخه‌ها حساب می‌شوند.</p>
        </div>
      </div>
      <RatesTabs />
      {children}
    </>
  );
}
