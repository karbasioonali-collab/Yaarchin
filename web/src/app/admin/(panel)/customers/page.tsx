import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { customerProfiles, roles, userRoles, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth/can";
import { views30For } from "@/lib/customer/events";
import { favoriteCounts } from "@/lib/customer/favorites";
import { BUSINESS_TYPE_FA, toBusinessType } from "@/lib/customer/profile";
import { customerReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { toLatinDigits } from "@/lib/validation";
import styles from "../panel.module.css";

export const metadata: Metadata = { title: "مشتریان" };

const PAGE_SIZE = 30;

// فهرست مشتری‌های سایت (نقش customer). دسترسی: customers.view (ادمین همیشه).
export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requirePermission("customers.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const status = sp.status === "active" || sp.status === "disabled" ? sp.status : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const ready = await customerReady();

  const customerIds = db
    .select({ id: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.key, "customer"));
  const conds: SQL[] = [inArray(users.id, customerIds)];
  if (q) {
    const like = `%${toLatinDigits(q)}%`;
    const byText = [ilike(users.fullName, `%${q}%`), ilike(users.mobile, like), ilike(users.email, like)];
    // جستجوی شهر فقط بعد از migration ۰۰۰۳
    if (ready) {
      byText.push(inArray(users.id, db.select({ id: customerProfiles.userId }).from(customerProfiles).where(ilike(customerProfiles.city, `%${q}%`))));
    }
    conds.push(or(...byText)!);
  }
  if (status) conds.push(eq(users.status, status));
  const where = and(...conds);

  const [{ total }] = await db.select({ total: count() }).from(users).where(where);
  const rows = await db
    .select({ id: users.id, fullName: users.fullName, mobile: users.mobile, email: users.email, status: users.status, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const ids = rows.map((r) => r.id);
  const [profiles, favs, views] = await Promise.all([
    ready && ids.length
      ? db.select({ userId: customerProfiles.userId, businessType: customerProfiles.businessType, city: customerProfiles.city }).from(customerProfiles).where(inArray(customerProfiles.userId, ids))
      : Promise.resolve([]),
    favoriteCounts(ids),
    views30For(ids),
  ]);
  const profileOf = new Map(profiles.map((p) => [p.userId, p]));
  const pages = Math.ceil(total / PAGE_SIZE);
  const qs = (p: number) => `?${new URLSearchParams({ ...(q && { q }), ...(status && { status }), page: String(p) })}`;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>مشتریان</h1>
          <p className={styles.pageSub}>{fmtNum(total)} مشتری</p>
        </div>
      </div>

      <div className={styles.card}>
        <form className={styles.toolbar}>
          <input name="q" defaultValue={q} placeholder="جستجو: نام، موبایل، ایمیل، شهر" />
          <select name="status" defaultValue={status}>
            <option value="">همه</option>
            <option value="active">فعال</option>
            <option value="disabled">غیرفعال</option>
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
                <th>فعالیت و شهر</th>
                <th>علاقه‌مندی</th>
                <th>بازدید ۳۰ روز</th>
                <th>ثبت‌نام</th>
                <th>آخرین ورود</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const p = profileOf.get(u.id);
                const bt = toBusinessType(p?.businessType);
                return (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/admin/customers/${u.id}`}>{u.fullName}</Link>
                      {u.status !== "active" && <span className={`${styles.badge} ${styles.badgeWarn}`} style={{ marginInlineStart: 6 }}>غیرفعال</span>}
                    </td>
                    <td>
                      <div className={styles.ltr}>{u.mobile ?? ""}</div>
                      <div className={`${styles.ltr} ${styles.muted}`}>{u.email ?? ""}</div>
                    </td>
                    <td>
                      {bt ? BUSINESS_TYPE_FA[bt] : <span className={styles.muted}>—</span>}
                      {p?.city && <div className={styles.muted}>{p.city}</div>}
                    </td>
                    <td>{fmtNum(favs.get(u.id) ?? 0)}</td>
                    <td>{fmtNum(views.get(u.id) ?? 0)}</td>
                    <td className={styles.muted}>{fmtDateTime(u.createdAt)}</td>
                    <td className={styles.muted}>{fmtDateTime(u.lastLoginAt)}</td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className={styles.muted}>
                    مشتری‌ای پیدا نشد.
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
