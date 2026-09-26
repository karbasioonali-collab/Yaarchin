import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import { requirePermission } from "@/lib/auth/can";
import { catalogAdminReady } from "@/lib/db-ready";
import styles from "../../panel.module.css";
import { createCompanyAction } from "../actions";
import { CompanyFields } from "../CompanyFields";

export const metadata: Metadata = { title: "کارخانه‌ی جدید" };

export default async function NewCompanyPage() {
  await requirePermission("companies.manage");
  if (!(await catalogAdminReady())) return <div className={styles.impersonation}>این بخش بعد از اجرای migration ۰۰۰۴ فعال می‌شود (در کنسول لیارا npm run db:migrate).</div>;
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>کارخانه‌ی جدید</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/companies">کارخانه‌ها</Link> · اطلاعات کارخانه محرمانه است و هرگز در سایت یا API عمومی نمایش داده نمی‌شود.
          </p>
        </div>
      </div>
      <div className={styles.card}>
        <ActionForm action={createCompanyAction} submitLabel="ثبت کارخانه">
          <Field label="شناسه‌ی فروشنده در علی‌بابا" name="alibabaId" ltr maxLength={120} hint="برای جلوگیری از ثبت تکراری: اگر قبلاً ثبت شده باشد، پیام می‌دهد." />
          <Field label="لینک صفحه‌ی کارخانه در علی‌بابا" name="alibabaUrl" ltr maxLength={1000} hint="https://…" />
          <CompanyFields />
        </ActionForm>
      </div>
    </>
  );
}
