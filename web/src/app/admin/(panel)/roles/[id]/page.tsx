import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { permissions, rolePermissions, roles } from "@/db/schema";
import { ActionForm } from "@/components/ui/ActionForm";
import { Checkbox, Field } from "@/components/ui/Field";
import { requirePermission } from "@/lib/auth/can";
import { deleteRoleAction, updateRoleAction } from "../actions";
import styles from "../../panel.module.css";

export const metadata: Metadata = { title: "نقش" };

const GROUP_FA: Record<string, string> = {
  dashboard: "داشبورد",
  users: "کاربران",
  roles: "نقش‌ها",
  settings: "تنظیمات",
  activity: "لاگ فعالیت",
};

export default async function RolePage({ params }: PageProps<"/admin/roles/[id]">) {
  await requirePermission("roles.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [role] = await db.select().from(roles).where(eq(roles.id, id));
  if (!role) notFound();
  const all = await db.select().from(permissions).orderBy(permissions.groupKey, permissions.key);
  const mine = new Set(
    (await db.select({ k: rolePermissions.permissionKey }).from(rolePermissions).where(eq(rolePermissions.roleId, id))).map((r) => r.k),
  );
  const groups = [...new Set(all.map((p) => p.groupKey))];
  const isAdmin = role.key === "admin";

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{role.nameFa}</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/roles">نقش‌ها</Link> · <span className={styles.mono}>{role.key}</span>
          </p>
        </div>
      </div>

      <div className={styles.card}>
        {isAdmin ? (
          <p style={{ margin: 0 }}>ادمین همیشه به همه‌چیز دسترسی دارد و این نقش قابل ویرایش نیست.</p>
        ) : (
          <ActionForm action={updateRoleAction} submitLabel="ذخیره">
            <input type="hidden" name="id" value={role.id} />
            <div className={styles.row}>
              <Field label="نام فارسی" name="nameFa" defaultValue={role.nameFa} required />
              <Field label="نام انگلیسی" name="nameEn" defaultValue={role.nameEn} ltr />
            </div>
            <Field label="توضیح" name="description" defaultValue={role.description ?? ""} />
            {!role.isSystem && (
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <Checkbox name="isStaff" defaultChecked={role.isStaff} label="دسترسی به پنل" />
              </div>
            )}
            <div>
              {groups.map((g) => (
                <div key={g}>
                  <div className={styles.groupTitle}>{GROUP_FA[g] ?? g}</div>
                  <div className={styles.checkGrid}>
                    {all
                      .filter((p) => p.groupKey === g)
                      .map((p) => (
                        <Checkbox key={p.key} name="permissions" value={p.key} defaultChecked={mine.has(p.key)} label={p.nameFa} />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </ActionForm>
        )}
      </div>

      {!role.isSystem && (
        <div className={styles.card}>
          <ActionForm action={deleteRoleAction} submitLabel="حذف این نقش" submitVariant="danger" confirm="این نقش حذف شود؟">
            <input type="hidden" name="id" value={role.id} />
          </ActionForm>
        </div>
      )}
    </>
  );
}
