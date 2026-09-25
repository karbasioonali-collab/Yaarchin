import type { Metadata } from "next";
import { CategoryBoxes } from "@/components/site/CategoryBoxes";
import s from "@/components/site/site.module.css";
import { getCategoryTree } from "@/lib/catalog/public";

export const metadata: Metadata = { title: "دسته‌بندی‌ها" };

export default async function CategoriesPage() {
  const tree = await getCategoryTree();
  return (
    <div className={s.container}>
      <header className={s.pageHead} style={{ marginTop: 24 }}>
        <h1 className={s.pageTitle}>دسته‌بندی‌ها</h1>
        <p className={s.pageLead}>همه‌ی شاخه‌های محصولات یارچین.</p>
      </header>
      {tree.length ? <CategoryBoxes items={tree} /> : <p className={s.empty}>هنوز دسته‌ای ثبت نشده است.</p>}
    </div>
  );
}
