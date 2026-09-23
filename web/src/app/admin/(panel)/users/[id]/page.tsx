import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLog, roles, sessions, userRoles, users, userTotp } from "@/db/schema";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import { can, requirePermission } from "@/lib/auth/can";
import { fmtDateTime } from "@/lib/format";
import {
  resetTwoFactorAction,
  revokeSessionsAction,
  setPasswordAction,
  startImpersonationAction,
  updateUserAction,
} from "../actions";
import { UserFields } from "../UserFields";
import styles from "../../panel.module.css";

export const metadata: Metadata = { title: "کاربر" };

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function UserPage({ params }: PageProps<"/admin/users/[id]">) {
  const a = await requirePermission("users.view");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) notFound();

  const allRoles = await db.select().from(roles).orderBy(roles.createdAt);
  const mine = await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, id));
  const roleIds = mine.map((r) => r.roleId);
  const isStaff = allRoles.some((r) => r.isStaff && roleIds.includes(r.id));
  const [totp] = await db.select({ confirmedAt: userTotp.confirmedAt }).from(userTotp).where(eq(userTotp.userId, id));
  const activeSessions = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));
  const recent = await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.actorUserId, id))
    .orderBy(desc(activityLog.createdAt))
    .limit(10);

  const canManage = await can(a.user, "users.manage");
  const canImpersonate = !isStaff && (await can(a.user, "impersonate"));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{u.fullName}</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/users">کاربران</Link> · عضو از {fmtDateTime(u.createdAt)} · آخرین ورود {fmtDateTime(u.lastLoginAt)}
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
          <h2 className={styles.cardTitle}>مشخصات و نقش‌ها</h2>
          {canManage ? (
            <ActionForm action={updateUserAction} submitLabel="ذخیره">
              <input type="hidden" name="id" value={u.id} />
              <UserFields allRoles={allRoles} user={u} selectedRoleIds={roleIds} />
            </ActionForm>
          ) : (
            <p>
              <span className={styles.ltr}>{u.mobile}</span> <span className={styles.ltr}>{u.email}</span>
            </p>
          )}
        </div>

        {canManage && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>تعیین رمز جدید</h2>
            <ActionForm action={setPasswordAction} submitLabel="ثبت رمز" submitVariant="secondary">
              <input type="hidden" name="id" value={u.id} />
              <Field label="رمز جدید" name="password" type="password" autoComplete="new-password" required ltr minLength={10} />
            </ActionForm>
          </div>
        )}

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>امنیت</h2>
          <p style={{ marginTop: 0 }}>
            ورود دومرحله‌ای:{" "}
            {totp?.confirmedAt ? (
              <span className={styles.badge}>فعال از {fmtDateTime(totp.confirmedAt)}</span>
            ) : (
              <span className={`${styles.badge} ${styles.badgeWarn}`}>{isStaff ? "راه‌اندازی نشده" : "ندارد"}</span>
            )}
          </p>
          <p>نشست‌های فعال: {activeSessions.length}</p>
          {canManage && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {totp && (
                <ActionForm
                  action={resetTwoFactorAction}
                  submitLabel="ریست ورود دومرحله‌ای"
                  submitVariant="danger"
                  confirm="ورود دومرحله‌ای این کاربر ریست شود؟"
                >
                  <input type="hidden" name="id" value={u.id} />
                </ActionForm>
              )}
              <ActionForm action={revokeSessionsAction} submitLabel="بستن همه‌ی نشست‌ها" submitVariant="secondary">
                <input type="hidden" name="id" value={u.id} />
              </ActionForm>
            </div>
          )}
        </div>

        {canImpersonate && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>دیدن به‌جای این کاربر</h2>
            <p className={styles.muted} style={{ marginTop: 0 }}>
              ادمین سایت را همان‌طور که این مشتری می‌بیند، می‌بیند. همه‌ی کارها در لاگ ثبت می‌شود.
            </p>
            <ActionForm action={startImpersonationAction} submitLabel="شروع" submitVariant="secondary">
              <input type="hidden" name="id" value={u.id} />
            </ActionForm>
          </div>
        )}

        <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
          <h2 className={styles.cardTitle}>آخرین فعالیت‌ها</h2>
          {recent.length ? (
            <table className={styles.table}>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.mono}>{r.action}</td>
                    <td className={styles.muted}>{fmtDateTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>فعالیتی ثبت نشده.</p>
          )}
          <Link href={`/admin/activity?actor=${u.id}`}>همه‌ی فعالیت‌ها</Link>
        </div>
      </div>
    </>
  );
}
