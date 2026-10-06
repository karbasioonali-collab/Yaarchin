import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { companies, conversations, inquiries, inquirySupplierEvents, inquirySuppliers, products, users } from "@/db/schema";
import { can, requireAnyPermission } from "@/lib/auth/can";
import { CHAT_PERMS, chatAccess } from "@/lib/chat/access";
import { assignableStaff } from "@/lib/chat/service";
import { followupReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { INQUIRY_STATUS_FA, shortId, SUPPLIER_STATUS_FA, type SupplierStatus, supplierSummaryExpr } from "@/lib/followup/service";
import styles from "../panel.module.css";

export const metadata: Metadata = { title: "درخواست‌های مشتری" };
const UUID = /^[0-9a-f-]{36}$/i;
const customer = alias(users, "customer");
const creator = alias(users, "creator");

// همه‌ی درخواست‌های مشتری (برای کسی که همه‌ی گفتگوها را می‌بیند) و «فعالیت با کارخانه‌ها»: هر تغییر وضعیت با کارشناس، کارخانه و زمان؛
// با فیلتر کارشناس، ادمین می‌بیند هر کارشناس با کدام کارخانه‌ها کار کرده.
export default async function InquiriesPage({ searchParams }: PageProps<"/admin/inquiries">) {
  const a = await requireAnyPermission(CHAT_PERMS);
  if (!(await followupReady())) {
    return <div className={styles.impersonation}>جدول‌های پیگیری (migration ۰۰۰۷) هنوز ساخته نشده‌اند. در کنسول لیارا npm run db:migrate را اجرا کنید.</div>;
  }
  const access = await chatAccess(a.user);
  if (!access.viewAll) notFound();
  const seeCompanies = await can(a.user, "companies.view");
  const sp = await searchParams;
  const expert = typeof sp.expert === "string" && UUID.test(sp.expert) ? sp.expert : "";
  const status = typeof sp.status === "string" && sp.status in INQUIRY_STATUS_FA ? sp.status : "";
  const view = sp.view === "activity" ? "activity" : "list";

  const conds: SQL[] = [];
  if (status) conds.push(eq(inquiries.status, status as "open"));
  if (expert)
    conds.push(
      sql`(${inquiries.createdBy} = ${expert} or exists (select 1 from inquiry_supplier_events e join inquiry_suppliers s on s.id = e.inquiry_supplier_id
        where s.inquiry_id = ${inquiries.id} and e.created_by = ${expert}))`,
    );
  const [staff, list, activity] = await Promise.all([
    assignableStaff(),
    view === "list"
      ? db
          .select({
            id: inquiries.id,
            status: inquiries.status,
            qty: inquiries.qty,
            createdAt: inquiries.createdAt,
            updatedAt: inquiries.updatedAt,
            productTitle: sql<string | null>`coalesce(${products.titleFa}, ${inquiries.productTitle})`,
            conversationId: inquiries.conversationId,
            customerName: customer.fullName,
            creatorName: creator.fullName,
            summary: supplierSummaryExpr,
          })
          .from(inquiries)
          .innerJoin(conversations, eq(conversations.id, inquiries.conversationId))
          .innerJoin(customer, eq(customer.id, conversations.customerId))
          .leftJoin(creator, eq(creator.id, inquiries.createdBy))
          .leftJoin(products, eq(products.id, inquiries.productId))
          .where(conds.length ? and(...conds) : undefined)
          .orderBy(desc(inquiries.updatedAt))
          .limit(100)
      : Promise.resolve([]),
    view === "activity"
      ? db
          .select({
            id: inquirySupplierEvents.id,
            at: inquirySupplierEvents.createdAt,
            status: inquirySupplierEvents.status,
            note: inquirySupplierEvents.note,
            by: creator.fullName,
            companyId: inquirySuppliers.companyId,
            companyName: companies.nameEn,
            inquiryId: inquirySuppliers.inquiryId,
          })
          .from(inquirySupplierEvents)
          .innerJoin(inquirySuppliers, eq(inquirySuppliers.id, inquirySupplierEvents.inquirySupplierId))
          .innerJoin(companies, eq(companies.id, inquirySuppliers.companyId))
          .leftJoin(creator, eq(creator.id, inquirySupplierEvents.createdBy))
          .where(expert ? eq(inquirySupplierEvents.createdBy, expert) : undefined)
          .orderBy(desc(inquirySupplierEvents.id))
          .limit(200)
      : Promise.resolve([]),
  ]);
  const tabHref = (v: string) => `?${new URLSearchParams({ view: v, ...(expert ? { expert } : {}), ...(status ? { status } : {}) })}`;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>درخواست‌های مشتری</h1>
          <p className={styles.pageSub}>درخواست از داخل هر گفتگو ساخته می‌شود؛ پیگیری کارخانه‌ها در صفحه‌ی هر درخواست.</p>
        </div>
      </div>
      <nav className={styles.tabs} aria-label="نما">
        <Link href={tabHref("list")} className={`${styles.tab} ${view === "list" ? styles.tabActive : ""}`}>
          درخواست‌ها
        </Link>
        <Link href={tabHref("activity")} className={`${styles.tab} ${view === "activity" ? styles.tabActive : ""}`}>
          فعالیت با کارخانه‌ها
        </Link>
      </nav>
      <div className={styles.card}>
        <form method="get" className={styles.toolbar}>
          <input type="hidden" name="view" value={view} />
          <select name="expert" defaultValue={expert} aria-label="کارشناس">
            <option value="">همه‌ی کارشناس‌ها</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
          {view === "list" && (
            <select name="status" defaultValue={status} aria-label="وضعیت">
              <option value="">همه‌ی وضعیت‌ها</option>
              {Object.entries(INQUIRY_STATUS_FA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
          <button type="submit" className={styles.btnGhost}>
            فیلتر
          </button>
        </form>

        {view === "list" ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>درخواست</th>
                  <th>مشتری</th>
                  <th>کارخانه‌ها</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/inquiries/${r.id}`}>
                        #{shortId(r.id)} · {r.productTitle}
                      </Link>
                      <div className={styles.muted} style={{ fontSize: 12 }}>
                        {r.qty ? `${fmtNum(r.qty)} عدد · ` : ""}
                        {r.creatorName} · {fmtDateTime(r.createdAt)}
                      </div>
                    </td>
                    <td>
                      <Link href={`/admin/chats/${r.conversationId}`}>{r.customerName}</Link>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {r.summary
                        ? Object.entries(r.summary).map(([k, n]) => (
                            <span key={k} className={styles.badge}>
                              {SUPPLIER_STATUS_FA[k as SupplierStatus]}: {fmtNum(n)}
                            </span>
                          ))
                        : "—"}
                    </td>
                    <td>{INQUIRY_STATUS_FA[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list.length && <p className={styles.muted}>درخواستی نیست.</p>}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>زمان</th>
                  <th>کارشناس</th>
                  <th>کارخانه</th>
                  <th>وضعیت</th>
                  <th>درخواست</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{fmtDateTime(e.at)}</td>
                    <td>{e.by ?? "—"}</td>
                    <td>
                      {seeCompanies ? (
                        <Link href={`/admin/companies/${e.companyId}#correspondence`}>{e.companyName}</Link>
                      ) : (
                        <span className={styles.muted}>(فقط با «دیدن کارخانه‌ها»)</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.badge}>{SUPPLIER_STATUS_FA[e.status as SupplierStatus]}</span>
                      {e.note && <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{e.note}</div>}
                    </td>
                    <td>
                      <Link href={`/admin/inquiries/${e.inquiryId}`}>#{shortId(e.inquiryId)}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!activity.length && <p className={styles.muted}>فعالیتی ثبت نشده.</p>}
          </div>
        )}
      </div>
    </>
  );
}
