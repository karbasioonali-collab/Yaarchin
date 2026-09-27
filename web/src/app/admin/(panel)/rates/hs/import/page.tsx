import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/can";
import styles from "../../../panel.module.css";
import { HsImportForm } from "./HsImportForm";

export const metadata: Metadata = { title: "ورود HS code از فایل" };

export default async function HsImportPage() {
  await requirePermission("hs.manage");
  return (
    <div className={styles.grid}>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>ورود لیست HS code از فایل</h2>
        <HsImportForm />
      </div>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>ساختار فایل</h2>
        <p style={{ fontSize: 14 }}>
          ردیف اول سرستون است.{" "}
          <a href="/templates/hs-codes-template.csv" download>
            فایل نمونه (CSV)
          </a>{" "}
          را بگیرید و در اکسل پر کنید. ترتیب ستون‌ها مهم نیست.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ستون</th>
                <th>توضیح</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={styles.mono}>code / کد</td>
                <td>لازم. ۴ تا ۱۲ رقم؛ نقطه و فاصله مهم نیست (8509.40.00 = 85094000).</td>
              </tr>
              <tr>
                <td className={styles.mono}>value / مقدار</td>
                <td>لازم. درصد (مثل 15) یا مبلغ ثابت.</td>
              </tr>
              <tr>
                <td className={styles.mono}>title / شرح</td>
                <td>شرح کالا (اختیاری).</td>
              </tr>
              <tr>
                <td className={styles.mono}>type / نوع</td>
                <td>percent یا درصد (پیش‌فرض)؛ fixed یا ثابت.</td>
              </tr>
              <tr>
                <td className={styles.mono}>currency / ارز</td>
                <td>فقط برای مبلغ ثابت: IRT (تومان، پیش‌فرض)، USD، CNY، …</td>
              </tr>
              <tr>
                <td className={styles.mono}>per / به ازای</td>
                <td>فقط برای مبلغ ثابت: unit (هر عدد، پیش‌فرض)، kg (هر کیلو)، shipment (کل محموله).</td>
              </tr>
              <tr>
                <td className={styles.mono}>base / پایه</td>
                <td>فقط برای درصد: goods، shipping، costs با + (مثل goods+shipping+costs). خالی = هر سه (ارزش CIF).</td>
              </tr>
              <tr>
                <td className={styles.mono}>active / فعال</td>
                <td>خالی یا 1 = فعال؛ 0 یا «خیر» = برداشتن کد از لیست.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className={styles.muted} style={{ fontSize: 13 }}>
          هر کدِ تغییرکرده یک نسخه‌ی تازه می‌گیرد و نسخه‌ی قبلی در تاریخچه می‌ماند. کدی که در فایل نیست پاک نمی‌شود. <Link href="/admin/rates/hs">بازگشت به لیست</Link>
        </p>
      </div>
    </div>
  );
}
