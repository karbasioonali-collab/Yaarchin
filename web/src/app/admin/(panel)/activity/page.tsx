import type { Metadata } from "next";
import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { and, count, desc, eq, ilike, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLog, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth/can";
import { fmtDateTime, fmtNum } from "@/lib/format";
import styles from "../panel.module.css";

export const metadata: Metadata = { title: "لاگ فعالیت" };

const PAGE_SIZE = 50;

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requirePermission("activity.view");
  const sp = await searchParams;
  const actor = typeof sp.actor === "string" && /^[0-9a-f-]{36}$/i.test(sp.actor) ? sp.actor : "";
  const action = typeof sp.action === "string" ? sp.action.trim() : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const conds: SQL[] = [];
  if (actor) conds.push(eq(activityLog.actorUserId, actor));
  if (action) conds.push(ilike(activityLog.action, `${action}%`));
  const where = conds.length ? and(...conds) : undefined;

  const actingAs = alias(users, "acting_as");
  const [{ total }] = await db.select({ total: count() }).from(activityLog).where(where);
  const rows = await db
    .select({ log: activityLog, actorName: users.fullName, actingAsName: actingAs.fullName })
    .from(activityLog)
    .leftJoin(users, eq(users.id, activityLog.actorUserId))
    .leftJoin(actingAs, eq(actingAs.id, activityLog.actingAsUserId))
    .where(where)
    .orderBy(desc(activityLog.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const pages = Math.ceil(total / PAGE_SIZE);
  const qs = (p: number) => `?${new URLSearchParams({ ...(actor && { actor }), ...(action && { action }), page: String(p) })}`;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>لاگ فعالیت</h1>
          <p className={styles.pageSub}>{fmtNum(total)} مورد · فقط افزودنی، قابل ویرایش یا حذف نیست</p>
        </div>
      </div>
      <div className={styles.card}>
        <form className={styles.toolbar}>
          {actor && <input type="hidden" name="actor" value={actor} />}
          <input name="action" defaultValue={action} placeholder="نوع کار (مثلاً user. یا auth.)" dir="ltr" />
          <button type="submit" className={styles.btnGhost}>فیلتر</button>
          {(actor || action) && (
            <Link href="/admin/activity" className={styles.btnGhost}>
              حذف فیلتر
            </Link>
          )}
        </form>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>زمان</th>
                <th>کاربر</th>
                <th>کار</th>
                <th>روی</th>
                <th>جزئیات</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ log, actorName, actingAsName }) => (
                <tr key={log.id}>
                  <td className={styles.muted} style={{ whiteSpace: "nowrap" }}>{fmtDateTime(log.createdAt)}</td>
                  <td>
                    {log.actorUserId ? <Link href={`/admin/activity?actor=${log.actorUserId}`}>{actorName ?? "—"}</Link> : "سیستم"}
                    {actingAsName && <div className={styles.muted}>به‌جای {actingAsName}</div>}
                  </td>
                  <td className={styles.mono}>{log.action}</td>
                  <td>
                    {log.entityType === "user" && log.entityId ? (
                      <Link href={`/admin/users/${log.entityId}`} className={styles.mono}>user</Link>
                    ) : log.entityType === "role" && log.entityId ? (
                      <Link href={`/admin/roles/${log.entityId}`} className={styles.mono}>role</Link>
                    ) : (
                      <span className={styles.mono}>{log.entityType ?? ""} {log.entityType === "setting" ? log.entityId : ""}</span>
                    )}
                  </td>
                  <td>
                    {(log.before != null || log.after != null) && (
                      <details>
                        <summary className={styles.muted}>قبل / بعد</summary>
                        <pre className={styles.mono} dir="ltr" style={{ whiteSpace: "pre-wrap", maxWidth: 420 }}>
                          {JSON.stringify({ before: log.before, after: log.after }, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                  <td className={`${styles.mono} ${styles.muted}`} dir="ltr">{log.ip ?? ""}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className={styles.muted}>موردی نیست.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className={styles.pager}>
            {page > 1 && <Link href={qs(page - 1)}>قبلی</Link>}
            <span className={styles.muted}>صفحه‌ی {fmtNum(page)} از {fmtNum(pages)}</span>
            {page < pages && <Link href={qs(page + 1)}>بعدی</Link>}
          </div>
        )}
      </div>
    </>
  );
}
