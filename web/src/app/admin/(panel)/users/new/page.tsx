import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db/client";
import { roles } from "@/db/schema";
import { ActionForm } from "@/components/ui/ActionForm";
import { requirePermission } from "@/lib/auth/can";
import { createUserAction } from "../actions";
import { UserFields } from "../UserFields";
import styles from "../../panel.module.css";

export const metadata: Metadata = { title: "کاربر جدید" };

export default async function NewUserPage() {
  await requirePermission("users.manage");
  const allRoles = await db.select().from(roles).orderBy(roles.createdAt);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>کاربر جدید</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/users">کاربران</Link>
          </p>
        </div>
      </div>
      <div className={styles.card}>
        <ActionForm action={createUserAction} submitLabel="ساخت کاربر">
          <UserFields allRoles={allRoles} withPassword />
        </ActionForm>
      </div>
    </>
  );
}
