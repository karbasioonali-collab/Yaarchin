import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ui/ActionForm";
import { requirePermission } from "@/lib/auth/can";
import { adminCategoryTree } from "@/lib/catalog/admin-tree";
import { ratesReady } from "@/lib/db-ready";
import styles from "../../panel.module.css";
import { createProductAction } from "../actions";
import { ProductFields } from "../ProductFields";

export const metadata: Metadata = { title: "محصول جدید" };

export default async function NewProductPage() {
  await requirePermission("products.manage");
  const [tree, hsReady] = await Promise.all([adminCategoryTree(), ratesReady()]);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>محصول جدید</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/products">محصولات</Link> · بعد از ساخت، مشخصات، وزن و کارتن، عکس‌ها و کارخانه‌ها را در صفحه‌ی محصول اضافه کنید.
          </p>
        </div>
      </div>
      <div className={styles.card}>
        {/* آپلود در همین فرم نیست: قبل از ساخت، محصولی نیست که فایل به آن وصل شود (فایل بی‌صاحب در فضای محدود آزمایشی می‌ماند).
            بعد از ساخت مستقیم به بخش عکس‌های همان محصول می‌رود. docs/infoyaarchin.md بخش ۲۷ */}
        <p className={styles.notice} role="note">
          📷 <strong>عکس و ویدیو:</strong> بعد از ذخیره‌ی محصول، عکس و ویدیو را اضافه کنید؛ با زدن «ساخت محصول» مستقیم به بخش عکس‌های همین محصول می‌روید.
        </p>
        <ActionForm action={createProductAction} submitLabel="ساخت محصول">
          <ProductFields tree={tree} hs={{ ready: hsReady, current: null }} />
        </ActionForm>
      </div>
    </>
  );
}
