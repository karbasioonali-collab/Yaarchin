import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, desc, eq, ilike, inArray, max, or, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, companyCorrespondence, companyExternalIds, productListings, products } from "@/db/schema";
import { can, requirePermission } from "@/lib/auth/can";
import { COMPANY_STATUS_FA, COMPANY_TYPE_FA } from "@/lib/catalog/admin-labels";
import { catalogAdminReady, catalogReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import styles from "../panel.module.css";

export const metadata: Metadata = { title: "کارخانه‌ها" };
const PAGE = 30;

export default async function CompaniesPage({ searchParams }: PageProps<"/admin/companies">) {
  const a = await requirePermission("companies.view");
  if (!(await catalogReady())) return <div className={styles.impersonation}>جدول‌ها هنوز ساخته نشده‌اند؛ در کنسول لیارا npm run db:migrate را اجرا کنید.</div>;
  const ready = await catalogAdminReady();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const status = sp.status === "active" || sp.status === "blocked" ? sp.status : "";
  const page = Math.max(1, Number(sp.page) || 1);
  // فیلتر «محصول»: کارخانه‌هایی که برای این محصول لیستینگ دارند (بخش ۳۸)
  const product = typeof sp.product === "string" && /^[0-9a-f-]{36}$/i.test(sp.product) ? sp.product : "";
  const productOptions = await db
    .selectDistinct({ id: products.id, titleFa: products.titleFa })
    .from(products)
    .innerJoin(productListings, eq(productListings.productId, products.id))
    .orderBy(asc(products.titleFa));

  const conds: SQL[] = [];
  if (q) {
    const like = `%${q}%`;
    conds.push(
      or(
        ilike(companies.nameEn, like),
        ilike(companies.nameFa, like),
        ilike(companies.city, like),
        ilike(companies.province, like),
        inArray(
          companies.id,
          db
            .select({ id: companyExternalIds.companyId })
            .from(companyExternalIds)
            .where(ilike(companyExternalIds.externalId, `%${q.replace(/\s+/g, "").toLowerCase()}%`)),
        ),
      )!,
    );
  }
  if (status) conds.push(eq(companies.status, status));
  if (product) conds.push(inArray(companies.id, db.select({ id: productListings.companyId }).from(productListings).where(eq(productListings.productId, product))));
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(companies).where(where);
  const rows = await db
    .select({
      id: companies.id,
      nameEn: companies.nameEn,
      nameFa: companies.nameFa,
      companyType: companies.companyType,
      city: companies.city,
      province: companies.province,
      status: companies.status,
      source: companies.source,
    })
    .from(companies)
    .where(where)
    .orderBy(desc(companies.createdAt))
    .limit(PAGE)
    .offset((page - 1) * PAGE);
  const ids = rows.map((r) => r.id);
  const [exts, listings, lastMsg] = await Promise.all([
    ids.length
      ? db.select({ companyId: companyExternalIds.companyId, externalId: companyExternalIds.externalId }).from(companyExternalIds).where(inArray(companyExternalIds.companyId, ids))
      : [],
    ids.length
      ? db.select({ companyId: productListings.companyId, n: count() }).from(productListings).where(inArray(productListings.companyId, ids)).groupBy(productListings.companyId)
      : [],
    ready && ids.length
      ? db
          .select({ companyId: companyCorrespondence.companyId, at: max(companyCorrespondence.occurredAt) })
          .from(companyCorrespondence)
          .where(inArray(companyCorrespondence.companyId, ids))
          .groupBy(companyCorrespondence.companyId)
      : [],
  ]);
  const listingsOf = new Map(listings.map((l) => [l.companyId, l.n]));
  const lastOf = new Map(lastMsg.map((m) => [m.companyId, m.at]));
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => `?${new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(product && { product }), page: String(p) })}`;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>کارخانه‌ها</h1>
          <p className={styles.pageSub}>{fmtNum(total)} کارخانه · محرمانه؛ هرگز در سایت یا API عمومی نمایش داده نمی‌شود.</p>
        </div>
        {ready && (await can(a.user, "companies.manage")) && (
          <Link href="/admin/companies/new" className={styles.btn}>
            کارخانه‌ی جدید
          </Link>
        )}
      </div>
      <div className={styles.card}>
        <form className={styles.toolbar}>
          <input name="q" defaultValue={q} placeholder="جستجو: نام، شهر، شناسه‌ی علی‌بابا" />
          <select name="status" defaultValue={status}>
            <option value="">همه</option>
            <option value="active">فعال</option>
            <option value="blocked">مسدود</option>
          </select>
          <select name="product" defaultValue={product} aria-label="محصول">
            <option value="">همه‌ی محصولات</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titleFa}
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
                <th>کارخانه</th>
                <th>نوع</th>
                <th>شهر</th>
                <th>شناسه‌ی علی‌بابا</th>
                <th>لیستینگ</th>
                <th>آخرین مکاتبه</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/companies/${c.id}`} className={styles.ltr}>
                      {c.nameEn}
                    </Link>
                    {c.nameFa && <div className={styles.muted}>{c.nameFa}</div>}
                    {c.status !== "active" && <span className={`${styles.badge} ${styles.badgeWarn}`}>{COMPANY_STATUS_FA[c.status]}</span>}
                    {c.source === "demo" && <span className={`${styles.badge} ${styles.badgeMuted}`}>نمونه</span>}
                  </td>
                  <td>{COMPANY_TYPE_FA[c.companyType]}</td>
                  <td className={styles.ltr}>{[c.city, c.province].filter(Boolean).join(", ")}</td>
                  <td className={`${styles.ltr} ${styles.mono}`}>
                    {exts
                      .filter((e) => e.companyId === c.id)
                      .map((e) => e.externalId)
                      .join("، ")}
                  </td>
                  <td>{fmtNum(listingsOf.get(c.id) ?? 0)}</td>
                  <td className={styles.muted}>{fmtDateTime(lastOf.get(c.id) ?? null)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className={styles.muted}>
                    کارخانه‌ای پیدا نشد.
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
