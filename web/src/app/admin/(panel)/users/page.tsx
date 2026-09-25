import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, inArray, notInArray, or, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { roles, userRoles, users } from "@/db/schema";
import { can, requirePermission } from "@/lib/auth/can";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { toLatinDigits } from "@/lib/validation";
import styles from "../panel.module.css";

export const metadata: Metadata = { title: "کاربران" };

const PAGE_SIZE = 30;

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const a = await requirePermission("users.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const roleKey = typeof sp.role === "string" ? sp.role : "";
  const page = Math.max(1, Number(sp.page) || 1);

  // مشتری‌ها در بخش «مشتریان» هستند، نه اینجا
  const allRoles = (await db.select().from(roles).orderBy(roles.createdAt)).filter((r) => r.key !== "customer");
  const customerIds = db
    .select({ id: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.key, "customer"));
  const conds: SQL[] = [notInArray(users.id, customerIds)];
  if (q) {
    const like = `%${toLatinDigits(q)}%`;
    conds.push(or(ilike(users.fullName, `%${q}%`), ilike(users.mobile, like), ilike(users.email, like))!);
  }
  if (roleKey) {
    const role = allRoles.find((r) => r.key === roleKey);
    if (role) {
      const sub = db.select({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, role.id));
      conds.push(inArray(users.id, sub));
    }
  }
  const where = and(...conds);

  const [{ total }] = await db.select({ total: count() }).from(users).where(where);
  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const rolesOf = rows.length
    ? await db
        .select({ userId: userRoles.userId, nameFa: roles.nameFa, key: roles.key })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(inArray(userRoles.userId, rows.map((r) => r.id)))
    : [];
  const canManage = await can(a.user, "users.manage");
  const pages = Math.ceil(total / PAGE_SIZE);
  const qs = (p: number) => `?${new URLSearchParams({ ...(q && { q }), ...(roleKey && { role: roleKey }), page: String(p) })}`;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>کاربران</h1>
          <p className={styles.pageSub}>{fmtNum(total)} کاربر</p>
        </div>
        {canManage && (
          <Link href="/admin/users/new" className={styles.btn}>
            کاربر جدید
          </Link>
        )}
      </div>

      <div className={styles.card}>
        <form className={styles.toolbar}>
          <input name="q" defaultValue={q} placeholder="جستجو: نام، موبایل، ایمیل" />
          <select name="role" defaultValue={roleKey}>
            <option value="">همه‌ی نقش‌ها</option>
            {allRoles.map((r) => (
              <option key={r.id} value={r.key}>
                {r.nameFa}
              </option>
            ))}
          </select>
          <button type="submit" className={styles.btnGhost}>
            جستجو
          </button>
        </form>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>نام</th>
                <th>موبایل / ایمیل</th>
                <th>نقش</th>
                <th>وضعیت</th>
                <th>آخرین ورود</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/users/${u.id}`}>{u.fullName}</Link>
                  </td>
                  <td>
                    <div className={styles.ltr}>{u.mobile ?? ""}</div>
                    <div className={`${styles.ltr} ${styles.muted}`}>{u.email ?? ""}</div>
                  </td>
                  <td>
                    {rolesOf
                      .filter((r) => r.userId === u.id)
                      .map((r) => (
                        <span key={r.key} className={styles.badge}>
                          {r.nameFa}
                        </span>
                      ))}
                  </td>
                  <td>
                    {u.status === "active" ? (
                      <span className={styles.badge}>فعال</span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeWarn}`}>غیرفعال</span>
                    )}
                  </td>
                  <td className={styles.muted}>{fmtDateTime(u.lastLoginAt)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className={styles.muted}>
                    کاربری پیدا نشد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className={styles.pager}>
            {page > 1 && <Link href={qs(page - 1)}>قبلی</Link>}
            <span className={styles.muted}>
              صفحه‌ی {fmtNum(page)} از {fmtNum(pages)}
            </span>
            {page < pages && <Link href={qs(page + 1)}>بعدی</Link>}
          </div>
        )}
      </div>
    </>
  );
}
