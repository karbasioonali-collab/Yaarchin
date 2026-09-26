import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ui/ActionForm";
import { requirePermission } from "@/lib/auth/can";
import { adminCategoryTree } from "@/lib/catalog/admin-tree";
import { catalogReady } from "@/lib/db-ready";
import { fmtNum } from "@/lib/format";
import styles from "../panel.module.css";
import { createCategoryAction, moveCategoryAction } from "./actions";
import { CategoryFields } from "./CategoryFields";

export const metadata: Metadata = { title: "دسته‌بندی‌ها" };

export default async function CategoriesPage() {
  await requirePermission("categories.manage");
  if (!(await catalogReady())) return <div className={styles.impersonation}>جدول‌ها هنوز ساخته نشده‌اند؛ در کنسول لیارا npm run db:migrate را اجرا کنید.</div>;
  const tree = await adminCategoryTree();

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>دسته‌بندی‌ها</h1>
          <p className={styles.pageSub}>{fmtNum(tree.length)} دسته. درخت با عمق نامحدود؛ ترتیب هم‌سطح‌ها با ↑ ↓. دسته‌ی مخفی با همه‌ی زیرشاخه‌هایش در سایت دیده نمی‌شود.</p>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>دسته</th>
                <th>slug</th>
                <th>وضعیت</th>
                <th>محصول</th>
                <th>ترتیب</th>
              </tr>
            </thead>
            <tbody>
              {tree.map((c) => {
                const siblings = tree.filter((x) => x.parentId === c.parentId);
                const i = siblings.findIndex((x) => x.id === c.id);
                return (
                  <tr key={c.id}>
                    <td style={{ paddingInlineStart: 12 + c.depth * 22 }}>
                      {c.depth > 0 && <span className={styles.muted}>└ </span>}
                      <Link href={`/admin/categories/${c.id}`}>{c.nameFa}</Link>
                      {c.source === "demo" && (
                        <span className={`${styles.badge} ${styles.badgeMuted}`} style={{ marginInlineStart: 6 }}>
                          نمونه
                        </span>
                      )}
                    </td>
                    <td className={`${styles.ltr} ${styles.muted}`}>{c.slug}</td>
                    <td>{c.status === "active" ? <span className={styles.badge}>فعال</span> : <span className={`${styles.badge} ${styles.badgeWarn}`}>مخفی</span>}</td>
                    <td>{fmtNum(c.productCount)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <form action={moveCategoryAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="dir" value="up" />
                        <button type="submit" className={styles.btnGhost} disabled={i === 0} aria-label={`بالا بردن ${c.nameFa}`}>
                          ↑
                        </button>
                      </form>{" "}
                      <form action={moveCategoryAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="dir" value="down" />
                        <button type="submit" className={styles.btnGhost} disabled={i === siblings.length - 1} aria-label={`پایین بردن ${c.nameFa}`}>
                          ↓
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {!tree.length && (
                <tr>
                  <td colSpan={5} className={styles.muted}>
                    هنوز دسته‌ای ساخته نشده.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <h2 className={styles.cardTitle}>دسته‌ی جدید</h2>
        <ActionForm action={createCategoryAction} submitLabel="ساخت دسته">
          <CategoryFields tree={tree} />
        </ActionForm>
      </div>
    </>
  );
}
