import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ui/ActionForm";
import { requirePermission } from "@/lib/auth/can";
import { adminCategoryTree } from "@/lib/catalog/admin-tree";
import styles from "../../panel.module.css";
import { createProductAction } from "../actions";
import { ProductFields } from "../ProductFields";

export const metadata: Metadata = { title: "محصول جدید" };

export default async function NewProductPage() {
  await requirePermission("products.manage");
  const tree = await adminCategoryTree();
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
        <ActionForm action={createProductAction} submitLabel="ساخت محصول">
          <ProductFields tree={tree} />
        </ActionForm>
      </div>
    </>
  );
}
