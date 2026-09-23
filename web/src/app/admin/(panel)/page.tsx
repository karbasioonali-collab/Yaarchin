import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLog, roles, sessions, userRoles, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth/can";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { getAllSettings } from "@/lib/settings";
import styles from "./panel.module.css";

export const metadata: Metadata = { title: "داشبورد" };

export default async function DashboardPage() {
  const a = await requirePermission("dashboard.view");

  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(users);
  const byRole = await db
    .select({ key: roles.key, nameFa: roles.nameFa, n: count(userRoles.userId) })
    .from(roles)
    .leftJoin(userRoles, eq(userRoles.roleId, roles.id))
    .groupBy(roles.id)
    .orderBy(roles.createdAt);
  const [{ activeSessions }] = await db
    .select({ activeSessions: count() })
    .from(sessions)
    .where(and(isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  const recent = await db
    .select({ log: activityLog, actorName: users.fullName })
    .from(activityLog)
    .leftJoin(users, eq(users.id, activityLog.actorUserId))
    .orderBy(desc(activityLog.createdAt))
    .limit(8);
  const features = (await getAllSettings()).filter((s) => s.groupKey === "features");

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>سلام {a.user.fullName.split(" ")[0]} 👋</h1>
          <p className={styles.pageSub}>خلاصه‌ی وضعیت یارچین</p>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{fmtNum(totalUsers)}</div>
          <div className={styles.statLabel}>کل کاربران</div>
        </div>
        {byRole
          .filter((r) => r.key !== "company")
          .map((r) => (
            <div key={r.key} className={styles.stat}>
              <div className={styles.statValue}>{fmtNum(r.n)}</div>
              <div className={styles.statLabel}>{r.nameFa}</div>
            </div>
          ))}
        <div className={styles.stat}>
          <div className={styles.statValue}>{fmtNum(activeSessions)}</div>
          <div className={styles.statLabel}>نشست فعال</div>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>آخرین فعالیت‌ها</h2>
          <table className={styles.table}>
            <tbody>
              {recent.map(({ log, actorName }) => (
                <tr key={log.id}>
                  <td>{actorName ?? "سیستم"}</td>
                  <td className={styles.mono}>{log.action}</td>
                  <td className={styles.muted} style={{ whiteSpace: "nowrap" }}>{fmtDateTime(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginBottom: 0 }}>
            <Link href="/admin/activity">همه‌ی فعالیت‌ها</Link>
          </p>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>بخش‌ها</h2>
          <div>
            {features.map((f) => (
              <span key={f.key} className={`${styles.badge} ${f.value === true ? "" : styles.badgeWarn}`} style={{ marginBottom: 6 }}>
                {f.labelFa} {f.value === true ? "روشن" : "خاموش"}
              </span>
            ))}
          </div>
          <p style={{ marginBottom: 0 }}>
            <Link href="/admin/settings">تنظیمات و سوئیچ‌ها</Link>
          </p>
        </div>
      </div>
    </>
  );
}
