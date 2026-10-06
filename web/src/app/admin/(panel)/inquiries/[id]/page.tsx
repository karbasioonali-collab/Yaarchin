import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import ui from "@/components/ui/ui.module.css";
import { db } from "@/db/client";
import { companies, inquiries, inquirySupplierEvents, inquirySuppliers, products, users } from "@/db/schema";
import { can, requireAnyPermission } from "@/lib/auth/can";
import { CHAT_PERMS, canReply, canSee, chatAccess } from "@/lib/chat/access";
import { getConversation } from "@/lib/chat/service";
import { followupReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { INQUIRY_STATUS_FA, shortId, SUPPLIER_STATUS_FA, type SupplierStatus } from "@/lib/followup/service";
import styles from "../../panel.module.css";
import { addSupplierAction, inquiryStatusAction, supplierStatusAction } from "../actions";

export const metadata: Metadata = { title: "درخواست مشتری" };
const UUID = /^[0-9a-f-]{36}$/i;

// یک درخواست مشتری و کارخانه‌هایش: وضعیت فعلی هر کارخانه، تغییر وضعیت با یادداشت، و تاریخچه‌ی کامل (چه کسی، کی).
// اسم کارخانه‌ها فقط با companies.view (بقیه «کارخانه‌ی ۱، ۲، …» می‌بینند و نمی‌توانند وضعیت را عوض کنند).
export default async function InquiryPage({ params }: PageProps<"/admin/inquiries/[id]">) {
  const a = await requireAnyPermission(CHAT_PERMS);
  if (!(await followupReady())) notFound();
  const { id } = await params;
  const [inq] = UUID.test(id) ? await db.select().from(inquiries).where(eq(inquiries.id, id)) : [];
  if (!inq) notFound();
  const access = await chatAccess(a.user);
  const conv = await getConversation(inq.conversationId);
  if (!conv || !canSee(access, conv)) notFound();
  const manage = access.assign || canReply(access, { ...conv, status: "open" });
  const seeCompanies = await can(a.user, "companies.view");
  const work = manage && seeCompanies;

  const [[customer], [product], [creator], sups] = await Promise.all([
    db.select({ fullName: users.fullName }).from(users).where(eq(users.id, conv.customerId)),
    inq.productId ? db.select({ id: products.id, titleFa: products.titleFa }).from(products).where(eq(products.id, inq.productId)) : Promise.resolve([]),
    inq.createdBy ? db.select({ fullName: users.fullName }).from(users).where(eq(users.id, inq.createdBy)) : Promise.resolve([]),
    db
      .select({ s: inquirySuppliers, name: companies.nameEn, companyStatus: companies.status })
      .from(inquirySuppliers)
      .innerJoin(companies, eq(companies.id, inquirySuppliers.companyId))
      .where(eq(inquirySuppliers.inquiryId, inq.id))
      .orderBy(asc(inquirySuppliers.createdAt)),
  ]);
  const events = sups.length
    ? await db
        .select({ e: inquirySupplierEvents, by: users.fullName })
        .from(inquirySupplierEvents)
        .leftJoin(users, eq(users.id, inquirySupplierEvents.createdBy))
        .where(
          inArray(
            inquirySupplierEvents.inquirySupplierId,
            sups.map((x) => x.s.id),
          ),
        )
        .orderBy(desc(inquirySupplierEvents.id))
    : [];
  const label = (i: number, name: string) => (seeCompanies ? name : `کارخانه‌ی ${fmtNum(i + 1)}`);
  const indexOf = new Map(sups.map((x, i) => [x.s.id, i]));
  const allCompanies = work
    ? await db.select({ id: companies.id, nameEn: companies.nameEn }).from(companies).where(eq(companies.status, "active")).orderBy(asc(companies.nameEn))
    : [];
  const inList = new Set(sups.map((x) => x.s.companyId));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>
            درخواست #{shortId(inq.id)} · {product?.titleFa ?? inq.productTitle}
          </h1>
          <p className={styles.pageSub}>
            {access.viewAll && <Link href="/admin/inquiries">درخواست‌ها</Link>}
            {access.viewAll && " · "}
            <Link href={`/admin/chats/${conv.id}`}>گفتگوی {customer?.fullName}</Link> · {INQUIRY_STATUS_FA[inq.status]} · ساخته‌ی {creator?.fullName ?? "—"}،{" "}
            {fmtDateTime(inq.createdAt)}
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>درخواست</h2>
          <p style={{ margin: 0 }}>
            محصول:{" "}
            {product ? (
              <Link href={`/admin/products/${product.id}`}>{product.titleFa}</Link>
            ) : (
              <>
                {inq.productTitle} <span className={`${styles.badge} ${styles.badgeWarn}`}>خارج از سایت</span>
              </>
            )}
          </p>
          <p style={{ margin: "6px 0" }}>تعداد: {inq.qty ? fmtNum(inq.qty) : "—"}</p>
          {inq.note && <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{inq.note}</p>}
          {manage && (
            <ActionForm action={inquiryStatusAction} submitLabel="ذخیره‌ی وضعیت" submitVariant="secondary">
              <input type="hidden" name="id" value={inq.id} />
              <label className={ui.field}>
                <span className={ui.label}>وضعیت درخواست</span>
                <select name="status" defaultValue={inq.status} className={ui.select}>
                  {Object.entries(INQUIRY_STATUS_FA).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </ActionForm>
          )}
        </div>

        {work && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>افزودن کارخانه</h2>
            <ActionForm action={addSupplierAction} submitLabel="افزودن">
              <input type="hidden" name="inquiryId" value={inq.id} />
              <label className={ui.field}>
                <span className={ui.label}>کارخانه</span>
                <select name="companyId" className={ui.select} defaultValue="">
                  <option value="">انتخاب کنید…</option>
                  {allCompanies
                    .filter((c) => !inList.has(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameEn}
                      </option>
                    ))}
                </select>
              </label>
            </ActionForm>
            <p className={styles.muted} style={{ fontSize: 13 }}>
              کارخانه‌هایی که برای این محصول لیستینگ فعال دارند هنگام ساخت درخواست خودکار اضافه شده‌اند.
            </p>
          </div>
        )}

        <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
          <h2 className={styles.cardTitle}>کارخانه‌ها ({fmtNum(sups.length)})</h2>
          {!seeCompanies && (
            <p className={styles.muted} style={{ marginTop: -6, fontSize: 13 }}>
              اسم کارخانه‌ها و تغییر وضعیت فقط با دسترسی «دیدن کارخانه‌ها».
            </p>
          )}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>کارخانه</th>
                  <th>وضعیت</th>
                  <th>آخرین یادداشت</th>
                  {work && <th>ثبت وضعیت تازه</th>}
                </tr>
              </thead>
              <tbody>
                {sups.map(({ s, name, companyStatus }, i) => (
                  <tr key={s.id}>
                    <td>
                      {seeCompanies ? <Link href={`/admin/companies/${s.companyId}#correspondence`}>{name}</Link> : label(i, name)}
                      {companyStatus !== "active" && <span className={`${styles.badge} ${styles.badgeMuted}`}>غیرفعال</span>}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${s.status === "declined" ? styles.badgeMuted : s.status === "pending" ? styles.badgeWarn : ""}`}>
                        {SUPPLIER_STATUS_FA[s.status as SupplierStatus]}
                      </span>
                      <div className={styles.muted} style={{ fontSize: 12 }}>
                        {fmtDateTime(s.updatedAt)}
                      </div>
                    </td>
                    <td style={{ fontSize: 13, whiteSpace: "pre-wrap", maxWidth: 280 }}>{s.lastNote}</td>
                    {work && (
                      <td style={{ minWidth: 260 }}>
                        <ActionForm action={supplierStatusAction} submitLabel="ثبت" submitVariant="secondary" className={styles.inlineForm}>
                          <input type="hidden" name="supplierId" value={s.id} />
                          <select name="status" defaultValue={s.status === "pending" ? "contacted" : s.status} className={ui.select} aria-label="وضعیت">
                            {Object.entries(SUPPLIER_STATUS_FA).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                          <input name="note" className={ui.input} placeholder="یادداشت (قیمت، شرایط، …)" maxLength={2000} aria-label="یادداشت" />
                        </ActionForm>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!sups.length && <p className={styles.muted}>هنوز کارخانه‌ای در فهرست نیست.</p>}
        </div>

        <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
          <h2 className={styles.cardTitle}>تاریخچه ({fmtNum(events.length)})</h2>
          {events.map(({ e, by }) => {
            const i = indexOf.get(e.inquirySupplierId) ?? 0;
            return (
              <div key={e.id} className={styles.batch}>
                <div className={styles.timelineHead}>
                  <strong>{fmtDateTime(e.createdAt)}</strong>
                  <span>{by ?? "—"}</span>
                  <span>{label(i, sups[i]?.name ?? "")}</span>
                  <span className={styles.badge}>{SUPPLIER_STATUS_FA[e.status as SupplierStatus]}</span>
                </div>
                {e.note && <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{e.note}</div>}
              </div>
            );
          })}
          {!events.length && <p className={styles.muted}>هنوز وضعیتی ثبت نشده.</p>}
        </div>
      </div>
    </>
  );
}
