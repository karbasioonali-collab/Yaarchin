import type { Metadata } from "next";
import Link from "next/link";
import { count } from "drizzle-orm";
import { db } from "@/db/client";
import { rolePermissions, roles, userRoles } from "@/db/schema";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import { requirePermission } from "@/lib/auth/can";
import { getSetting } from "@/lib/settings";
import { fmtNum } from "@/lib/format";
import { createRoleAction } from "./actions";
import styles from "../panel.module.css";

export const metadata: Metadata = { title: "نقش‌ها و دسترسی" };

export default async function RolesPage() {
  await requirePermission("roles.manage");
  const list = await db.select().from(roles).orderBy(roles.createdAt);
  const members = await db.select({ roleId: userRoles.roleId, n: count() }).from(userRoles).groupBy(userRoles.roleId);
  const perms = await db.select({ roleId: rolePermissions.roleId, n: count() }).from(rolePermissions).groupBy(rolePermissions.roleId);
  const enforce = await getSetting<boolean>("auth.enforce_permissions");

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>نقش‌ها و دسترسی</h1>
          <p className={styles.pageSub}>
            {enforce ? (
              "دسترسی‌ها اعمال می‌شوند."
            ) : (
              <>
                فعلاً همه‌ی کاربران پنل به همه‌چیز دسترسی دارند؛ برای اعمال دسترسی‌ها سوئیچ آن را در{" "}
                <Link href="/admin/settings">تنظیمات</Link> روشن کنید.
              </>
            )}
          </p>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>نقش</th>
                <th>کلید</th>
                <th>پنل</th>
                <th>کاربران</th>
                <th>دسترسی‌ها</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/roles/${r.id}`}>{r.nameFa}</Link>
                    {r.isSystem && <span className={styles.muted}> (سیستمی)</span>}
                  </td>
                  <td className={styles.mono}>{r.key}</td>
                  <td>{r.isStaff ? "✓" : "—"}</td>
                  <td>{fmtNum(members.find((m) => m.roleId === r.id)?.n ?? 0)}</td>
                  <td>{r.key === "admin" ? "همه" : fmtNum(perms.find((p) => p.roleId === r.id)?.n ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>نقش جدید برای کارشناس‌ها</h2>
        <ActionForm action={createRoleAction} submitLabel="ساخت نقش">
          <div className={styles.row}>
            <Field label="نام فارسی" name="nameFa" required placeholder="مثلاً کارشناس ارشد" />
            <Field label="کلید انگلیسی" name="key" required ltr placeholder="senior_expert" />
            <Field label="نام انگلیسی" name="nameEn" ltr placeholder="Senior expert" />
          </div>
        </ActionForm>
      </div>
    </>
  );
}
