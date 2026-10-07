import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { customerProfiles, roles, userRoles, users } from "@/db/schema";
import { can, requirePermission } from "@/lib/auth/can";
import { views30For } from "@/lib/customer/events";
import { favoriteCounts } from "@/lib/customer/favorites";
import { BUSINESS_TYPE_FA, toBusinessType } from "@/lib/customer/profile";
import { customerReady, reportsReady } from "@/lib/db-ready";
import { scoreSource, scoresFor } from "@/lib/leads/score";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { toLatinDigits } from "@/lib/validation";
import styles from "../panel.module.css";

export const metadata: Metadata = { title: "مشتریان" };

const PAGE_SIZE = 30;

// فهرست مشتری‌های سایت (نقش customer). دسترسی: customers.view (ادمین همیشه).
export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  const a = await requirePermission("customers.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const status = sp.status === "active" || sp.status === "disabled" ? sp.status : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const [ready, scoring, seeRules] = await Promise.all([customerReady(), reportsReady(), can(a.user, "reports.view")]);
  // امتیاز جدیت: مرتب‌سازی و فیلتر روی «همه‌ی» مشتری‌ها، داخل دیتابیس (lib/leads/score.ts؛ docs بخش ۲۸)
  const sort = scoring && sp.sort === "score" ? "score" : "new";
  const minRaw = typeof sp.minScore === "string" ? Number(toLatinDigits(sp.minScore)) : NaN;
  const minScore = scoring && Number.isFinite(minRaw) && minRaw > 0 ? minRaw : null;

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

  const cols = { id: users.id, fullName: users.fullName, mobile: users.mobile, email: users.email, status: users.status, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt };
  let total: number;
  let rows: { id: string; fullName: string; mobile: string | null; email: string | null; status: string; createdAt: Date; lastLoginAt: Date | null }[];
  let scoreOf: Map<string, number>;
  if (sort === "score" || minScore !== null) {
    const { sql: src } = await scoreSource();
    const filtered = sql`from ${src} s join ${users} on ${users.id} = s.user_id where ${where} ${minScore !== null ? sql`and s.score >= ${minScore}` : sql``}`;
    const [cnt, page1] = await Promise.all([
      db.execute<{ n: string }>(sql`select count(*) as n ${filtered}`),
      db.execute<{ user_id: string; score: string }>(
        sql`select s.user_id, s.score ${filtered} order by ${sort === "score" ? sql`s.score desc,` : sql``} ${users.createdAt} desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`,
      ),
    ]);
    total = Number(cnt.rows[0]?.n ?? 0);
    scoreOf = new Map(page1.rows.map((x) => [x.user_id, Number(x.score)]));
    const order = page1.rows.map((x) => x.user_id);
    const found = order.length ? await db.select(cols).from(users).where(inArray(users.id, order)) : [];
    rows = order.map((id) => found.find((u) => u.id === id)!).filter(Boolean);
  } else {
    [{ total }] = await db.select({ total: count() }).from(users).where(where);
    rows = await db
      .select(cols)
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    scoreOf = scoring ? await scoresFor(rows.map((r) => r.id)) : new Map();
  }
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
  const qs = (p: number) =>
    `?${new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(sort === "score" && { sort }), ...(minScore !== null && { minScore: String(minScore) }), page: String(p) })}`;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>مشتریان</h1>
          <p className={styles.pageSub}>
            {fmtNum(total)} مشتری{minScore !== null ? ` با امتیاز ${fmtNum(minScore)} یا بیشتر` : ""}
            {scoring && seeRules && (
              <>
                {" "}
                · <Link href="/admin/reports/scoring">قانون‌های امتیاز جدیت</Link>
              </>
            )}
          </p>
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
          {scoring && (
            <>
              <select name="sort" defaultValue={sort} aria-label="مرتب‌سازی">
                <option value="new">جدیدترین</option>
                <option value="score">بیشترین امتیاز جدیت</option>
              </select>
              <input name="minScore" defaultValue={minScore ?? ""} placeholder="امتیاز حداقل" inputMode="numeric" aria-label="امتیاز حداقل" style={{ width: 120 }} />
            </>
          )}
          <button type="submit" className={styles.btnGhost}>
            جستجو
          </button>
        </form>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>نام</th>
                {scoring && <th>امتیاز جدیت</th>}
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
                    {scoring && (
                      <td>
                        <span className={styles.badge}>{fmtNum(scoreOf.get(u.id) ?? 0)}</span>
                      </td>
                    )}
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
                  <td colSpan={scoring ? 8 : 7} className={styles.muted}>
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
