import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/ActionForm";
import { Checkbox } from "@/components/ui/Field";
import { requirePermission } from "@/lib/auth/can";
import { adminCategoryTree, subtree } from "@/lib/catalog/admin-tree";
import { fmtNum } from "@/lib/format";
import styles from "../../panel.module.css";
import { deleteCategoryAction, updateCategoryAction } from "../actions";
import { CategoryFields } from "../CategoryFields";

export const metadata: Metadata = { title: "دسته" };

export default async function CategoryPage({ params }: PageProps<"/admin/categories/[id]">) {
  await requirePermission("categories.manage");
  const { id } = await params;
  const tree = await adminCategoryTree();
  const c = tree.find((x) => x.id === id);
  if (!c) notFound();
  // مسیر از ریشه تا خودش
  const path: string[] = [];
  let cur: typeof c | undefined = c;
  for (let i = 0; cur && i < 50; i++) {
    path.unshift(cur.nameFa);
    cur = cur.parentId ? tree.find((x) => x.id === cur!.parentId) : undefined;
  }

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{c.nameFa}</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/categories">دسته‌بندی‌ها</Link> · {path.join(" / ")} ·{" "}
            {c.status === "active" ? (
              <Link href={`/c/${c.slug}`} target="_blank">
                دیدن در سایت ↗
              </Link>
            ) : (
              "مخفی"
            )}
          </p>
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>ویرایش</h2>
          <p className={styles.muted} style={{ marginTop: 0 }}>
            عوض کردن slug آدرس صفحه‌ی دسته را عوض می‌کند؛ لینک‌های قدیمی دیگر کار نمی‌کنند.
          </p>
          <ActionForm action={updateCategoryAction} submitLabel="ذخیره">
            <input type="hidden" name="id" value={c.id} />
            <CategoryFields tree={tree} value={c} excluded={subtree(tree, c.id)} />
          </ActionForm>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>حذف دسته</h2>
          <p style={{ marginTop: 0 }}>
            زیرشاخه: {fmtNum(c.childCount)} · محصول مستقیم در این دسته: {fmtNum(c.productCount)}
          </p>
          {c.childCount > 0 ? (
            <p className={styles.muted}>تا وقتی زیرشاخه دارد حذف نمی‌شود؛ اول زیرشاخه‌ها را به دسته‌ی دیگری منتقل کنید (فیلد «دسته‌ی والد» در صفحه‌ی خودشان).</p>
          ) : (
            <ActionForm action={deleteCategoryAction} submitLabel="حذف دسته" submitVariant="danger" confirm={`دسته‌ی «${c.nameFa}» حذف شود؟`}>
              <input type="hidden" name="id" value={c.id} />
              {c.productCount > 0 && (
                <>
                  <p className={styles.impersonation} style={{ margin: 0 }}>
                    ⚠️ {fmtNum(c.productCount)} محصول در این دسته است. با حذف، این محصولات بی‌دسته می‌شوند (حذف نمی‌شوند) و تا دسته‌ی تازه بگیرند در صفحه‌ی دسته‌ها دیده نمی‌شوند.
                  </p>
                  <Checkbox name="confirmProducts" value="yes" label="می‌دانم؛ محصولات بی‌دسته شوند" />
                </>
              )}
              <p className={styles.muted} style={{ margin: 0 }}>
                دسته از فهرست دسته‌های کارخانه‌ها و «دسته‌های مورد علاقه»ی مشتری‌ها هم برداشته می‌شود.
              </p>
            </ActionForm>
          )}
        </div>
      </div>
    </>
  );
}
