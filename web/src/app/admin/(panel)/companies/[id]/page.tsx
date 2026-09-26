import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, companyCategories, companyContacts, companyCorrespondence, companyExternalIds, productListings, products, users } from "@/db/schema";
import { ActionForm } from "@/components/ui/ActionForm";
import { Checkbox, Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { can, requirePermission } from "@/lib/auth/can";
import { toTehranLocalInput } from "@/lib/catalog/admin-input";
import { CHANNEL_FA, COMPANY_STATUS_FA, COMPANY_TYPE_FA, CURRENCY_FA, DIRECTION_FA, KIND_FA, LISTING_STATUS_FA, SOURCE_FA } from "@/lib/catalog/admin-labels";
import { latestByCurrency, leadTimeHistory, priceHistory, priceText, qtyRange } from "@/lib/catalog/admin-listing";
import { adminCategoryTree, categoryLabel } from "@/lib/catalog/admin-tree";
import { catalogAdminReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import styles from "../../panel.module.css";
import {
  addCorrespondenceAction,
  addExternalIdAction,
  deleteContactAction,
  removeExternalIdAction,
  saveContactAction,
  setCompanyCategoriesAction,
  updateCompanyAction,
} from "../actions";
import { CompanyFields } from "../CompanyFields";

export const metadata: Metadata = { title: "کارخانه" };
const UUID = /^[0-9a-f-]{36}$/i;

const CONTACT_FIELDS = [
  ["name", "نام", false],
  ["role", "سمت", false],
  ["phone", "تلفن", true],
  ["email", "ایمیل", true],
  ["wechat", "WeChat", true],
  ["whatsapp", "WhatsApp", true],
] as const;

export default async function CompanyPage({ params }: PageProps<"/admin/companies/[id]">) {
  const a = await requirePermission("companies.view");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ready = await catalogAdminReady();
  const [c] = await db
    .select({
      id: companies.id,
      nameEn: companies.nameEn,
      nameFa: companies.nameFa,
      companyType: companies.companyType,
      province: companies.province,
      city: companies.city,
      address: companies.address,
      website: companies.website,
      status: companies.status,
      source: companies.source,
      createdAt: companies.createdAt,
      ...(ready ? { notes: companies.notes } : {}),
    })
    .from(companies)
    .where(eq(companies.id, id));
  if (!c) notFound();

  const [canManage, canWrite, canProducts] = await Promise.all([can(a.user, "companies.manage"), can(a.user, "correspondence.create"), can(a.user, "products.manage")]);
  const [exts, cats, tree, listings, contacts, history] = await Promise.all([
    db.select().from(companyExternalIds).where(eq(companyExternalIds.companyId, id)).orderBy(asc(companyExternalIds.createdAt)),
    db.select({ id: companyCategories.categoryId }).from(companyCategories).where(eq(companyCategories.companyId, id)),
    adminCategoryTree(),
    db
      .select({
        id: productListings.id,
        productId: productListings.productId,
        productTitle: products.titleFa,
        externalUrl: productListings.externalUrl,
        moq: productListings.moq,
        moqUnit: productListings.moqUnit,
        leadTimeDays: productListings.leadTimeDays,
        status: productListings.status,
      })
      .from(productListings)
      .leftJoin(products, eq(products.id, productListings.productId))
      .where(eq(productListings.companyId, id))
      .orderBy(desc(productListings.createdAt)),
    ready ? db.select().from(companyContacts).where(eq(companyContacts.companyId, id)).orderBy(asc(companyContacts.createdAt)) : Promise.resolve([]),
    ready
      ? db
          .select({ m: companyCorrespondence, by: users.fullName })
          .from(companyCorrespondence)
          .leftJoin(users, eq(users.id, companyCorrespondence.createdBy))
          .where(eq(companyCorrespondence.companyId, id))
          .orderBy(desc(companyCorrespondence.occurredAt), desc(companyCorrespondence.id))
      : Promise.resolve([]),
  ]);
  const catIds = new Set(cats.map((x) => x.id));
  const [prices, leads] = await Promise.all([priceHistory(listings.map((l) => l.id)), leadTimeHistory(listings.map((l) => l.id))]);
  const contactName = new Map(contacts.map((x) => [x.id, x.name]));
  const listingTitle = new Map(listings.map((l) => [l.id, l.productTitle ?? "بدون محصول"]));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={`${styles.pageTitle} ${styles.ltr}`}>{c.nameEn}</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/companies">کارخانه‌ها</Link> · {COMPANY_TYPE_FA[c.companyType]} · {COMPANY_STATUS_FA[c.status]}
            {c.source === "demo" && " · داده‌ی نمونه"} · ثبت {fmtDateTime(c.createdAt)}
          </p>
        </div>
      </div>

      <p className={styles.impersonation} style={{ marginTop: 0 }}>
        🔒 محرمانه: نام، آدرس، شناسه، تماس‌ها و مکاتبه‌های کارخانه فقط در پنل است و هرگز در سایت یا API عمومی نمایش داده نمی‌شود.
      </p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>مشخصات</h2>
          {canManage && ready ? (
            <ActionForm action={updateCompanyAction} submitLabel="ذخیره">
              <input type="hidden" name="id" value={c.id} />
              <CompanyFields value={c} />
            </ActionForm>
          ) : (
            <table className={styles.table}>
              <tbody>
                {[
                  ["نام فارسی", c.nameFa],
                  ["شهر / استان", [c.city, c.province].filter(Boolean).join(", ")],
                  ["آدرس", c.address],
                  ["وب‌سایت", c.website],
                  ["یادداشت", "notes" in c ? c.notes : null],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td className={styles.muted}>{k}</td>
                    <td style={{ whiteSpace: "pre-wrap" }}>{v || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>شناسه و لینک علی‌بابا</h2>
          <table className={styles.table}>
            <tbody>
              {exts.map((e) => (
                <tr key={e.id}>
                  <td className={`${styles.mono} ${styles.ltr}`}>{e.externalId}</td>
                  <td>
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer noopener">
                        لینک ↗
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {canManage && (
                      <form action={removeExternalIdAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" className={styles.linkButton}>
                          حذف
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {!exts.length && (
                <tr>
                  <td className={styles.muted}>ثبت نشده.</td>
                </tr>
              )}
            </tbody>
          </table>
          {canManage && (
            <ActionForm action={addExternalIdAction} submitLabel="افزودن شناسه" submitVariant="secondary">
              <input type="hidden" name="companyId" value={c.id} />
              <Field label="شناسه‌ی فروشنده در علی‌بابا" name="externalId" ltr required maxLength={120} />
              <Field label="لینک" name="url" ltr maxLength={1000} hint="https://…" />
            </ActionForm>
          )}

          <h2 className={styles.cardTitle} style={{ marginTop: 20 }}>
            دسته‌ها
          </h2>
          {canManage ? (
            <ActionForm action={setCompanyCategoriesAction} submitLabel="ذخیره‌ی دسته‌ها" submitVariant="secondary">
              <input type="hidden" name="companyId" value={c.id} />
              <div className={styles.checkGrid}>
                {tree.map((t) => (
                  <Checkbox key={t.id} name="categoryIds" value={t.id} defaultChecked={catIds.has(t.id)} label={categoryLabel(t)} />
                ))}
              </div>
            </ActionForm>
          ) : (
            <p>
              {tree
                .filter((t) => catIds.has(t.id))
                .map((t) => (
                  <span key={t.id} className={styles.badge}>
                    {t.nameFa}
                  </span>
                ))}
            </p>
          )}
        </div>

        <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
          <h2 className={styles.cardTitle}>تماس‌ها</h2>
          {!ready ? (
            <p className={styles.muted}>بعد از اجرای migration ۰۰۰۴.</p>
          ) : (
            <>
              {contacts.map((ct) =>
                canManage ? (
                  <details key={ct.id} className={styles.detailsBox}>
                    <summary>
                      <strong>{ct.name}</strong> {ct.role && <span className={styles.muted}>· {ct.role}</span>}{" "}
                      <span className={`${styles.ltr} ${styles.muted}`}>
                        {[ct.phone, ct.email, ct.wechat && `WeChat: ${ct.wechat}`, ct.whatsapp && `WhatsApp: ${ct.whatsapp}`].filter(Boolean).join(" · ")}
                      </span>
                    </summary>
                    <ActionForm action={saveContactAction} submitLabel="ذخیره‌ی تماس" submitVariant="secondary">
                      <input type="hidden" name="companyId" value={c.id} />
                      <input type="hidden" name="id" value={ct.id} />
                      {CONTACT_FIELDS.map(([k, label, ltr]) => (
                        <Field key={k} label={label} name={k} defaultValue={ct[k] ?? ""} ltr={ltr} maxLength={200} required={k === "name"} />
                      ))}
                      <Field label="یادداشت" name="note" defaultValue={ct.note ?? ""} maxLength={1000} />
                    </ActionForm>
                    <form action={deleteContactAction} style={{ marginTop: 8 }}>
                      <input type="hidden" name="id" value={ct.id} />
                      <button type="submit" className={styles.linkButton}>
                        حذف این تماس
                      </button>
                    </form>
                  </details>
                ) : (
                  <p key={ct.id}>
                    <strong>{ct.name}</strong> {ct.role && <span className={styles.muted}>· {ct.role}</span>}{" "}
                    <span className={styles.ltr}>
                      {[ct.phone, ct.email, ct.wechat && `WeChat: ${ct.wechat}`, ct.whatsapp && `WhatsApp: ${ct.whatsapp}`].filter(Boolean).join(" · ")}
                    </span>
                  </p>
                ),
              )}
              {!contacts.length && <p className={styles.muted}>تماسی ثبت نشده.</p>}
              {canManage && (
                <details className={styles.detailsBox}>
                  <summary>+ تماس جدید</summary>
                  <ActionForm action={saveContactAction} submitLabel="افزودن تماس" submitVariant="secondary">
                    <input type="hidden" name="companyId" value={c.id} />
                    {CONTACT_FIELDS.map(([k, label, ltr]) => (
                      <Field key={k} label={label} name={k} ltr={ltr} maxLength={200} required={k === "name"} />
                    ))}
                    <Field label="یادداشت" name="note" maxLength={1000} />
                  </ActionForm>
                </details>
              )}
            </>
          )}
        </div>

        <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
          <h2 className={styles.cardTitle}>محصولات این کارخانه ({fmtNum(listings.length)})</h2>
          {listings.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>محصول</th>
                    <th>آخرین قیمت</th>
                    <th>حداقل سفارش</th>
                    <th>زمان آماده‌سازی</th>
                    <th>وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => {
                    const lt = leads.get(l.id)?.[0];
                    return (
                      <tr key={l.id}>
                        <td>
                          {l.productId && canProducts ? <Link href={`/admin/products/${l.productId}/listings/${l.id}`}>{l.productTitle}</Link> : (l.productTitle ?? "بدون محصول")}
                          {l.externalUrl && (
                            <>
                              {" "}
                              <a href={l.externalUrl} target="_blank" rel="noreferrer noopener" className={styles.muted}>
                                ↗
                              </a>
                            </>
                          )}
                        </td>
                        <td>
                          {latestByCurrency(prices.get(l.id)).map((b) => (
                            <div key={b.currency}>
                              {b.tiers.map((t, i) => (
                                <div key={i} className={styles.muted}>
                                  {qtyRange(t)}: {priceText(t)} {CURRENCY_FA[b.currency]}
                                </div>
                              ))}
                            </div>
                          ))}
                          {!prices.get(l.id)?.length && <span className={styles.muted}>—</span>}
                        </td>
                        <td>{l.moq ? `${fmtNum(l.moq)} ${l.moqUnit ?? ""}` : "—"}</td>
                        <td>
                          {lt
                            ? lt.tiers.map((t, i) => (
                                <div key={i}>
                                  {qtyRange(t)}: {fmtNum(t.days)} روز
                                </div>
                              ))
                            : l.leadTimeDays
                              ? `${fmtNum(l.leadTimeDays)} روز`
                              : "—"}
                        </td>
                        <td>{LISTING_STATUS_FA[l.status]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.muted}>هنوز لیستینگی ندارد. لیستینگ از صفحه‌ی هر محصول اضافه می‌شود.</p>
          )}
        </div>

        <div className={styles.card} style={{ gridColumn: "1 / -1" }} id="correspondence">
          <h2 className={styles.cardTitle}>سابقه‌ی مکاتبه ({fmtNum(history.length)})</h2>
          <p className={styles.muted} style={{ marginTop: 0 }}>
            فقط افزودنی: ویرایش و حذف ندارد. برای اصلاح، یادداشت تازه ثبت کنید و به شماره‌ی مورد قبلی (#) اشاره کنید.
          </p>
          {!ready ? (
            <p className={styles.muted}>بعد از اجرای migration ۰۰۰۴.</p>
          ) : (
            <>
              {canWrite && (
                <details className={styles.detailsBox} open={!history.length}>
                  <summary>+ ثبت مکاتبه</summary>
                  <ActionForm action={addCorrespondenceAction} submitLabel="ثبت">
                    <input type="hidden" name="companyId" value={c.id} />
                    <div className={styles.row}>
                      {(
                        [
                          ["kind", "نوع", KIND_FA, "note"],
                          ["channel", "کانال", CHANNEL_FA, "alibaba_chat"],
                          ["direction", "جهت", DIRECTION_FA, "internal"],
                        ] as const
                      ).map(([name, label, opts, def]) => (
                        <label key={name} className={ui.field}>
                          <span className={ui.label}>{label}</span>
                          <select name={name} defaultValue={def} className={ui.select}>
                            {Object.entries(opts).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    <div className={styles.row}>
                      <label className={ui.field}>
                        <span className={ui.label}>با چه کسی (اختیاری)</span>
                        <select name="contactId" defaultValue="" className={ui.select}>
                          <option value="">—</option>
                          {contacts.map((ct) => (
                            <option key={ct.id} value={ct.id}>
                              {ct.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={ui.field}>
                        <span className={ui.label}>درباره‌ی محصول (اختیاری)</span>
                        <select name="listingId" defaultValue="" className={ui.select}>
                          <option value="">—</option>
                          {listings.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.productTitle ?? "بدون محصول"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Field label="زمان (به وقت تهران)" name="occurredAt" type="datetime-local" defaultValue={toTehranLocalInput(new Date())} ltr />
                    </div>
                    <label className={ui.field}>
                      <span className={ui.label}>متن یا خلاصه‌ی مکاتبه</span>
                      <textarea name="body" className={ui.textarea} required maxLength={20000} />
                    </label>
                  </ActionForm>
                </details>
              )}
              <ol className={styles.timeline}>
                {history.map(({ m, by }) => (
                  <li key={m.id} className={styles.timelineItem}>
                    <div className={styles.timelineHead}>
                      <span className={styles.mono}>#{m.id}</span>
                      <strong>{fmtDateTime(m.occurredAt)}</strong>
                      <span className={styles.badge}>{KIND_FA[m.kind]}</span>
                      <span className={`${styles.badge} ${styles.badgeMuted}`}>{CHANNEL_FA[m.channel]}</span>
                      <span className={`${styles.badge} ${styles.badgeMuted}`}>{DIRECTION_FA[m.direction]}</span>
                      {m.contactId && <span className={styles.muted}>با {contactName.get(m.contactId) ?? "—"}</span>}
                      {m.listingId && <span className={styles.muted}>درباره‌ی {listingTitle.get(m.listingId) ?? "—"}</span>}
                    </div>
                    <div className={styles.timelineBody}>{m.body}</div>
                    <div className={styles.muted} style={{ fontSize: 12 }}>
                      ثبت: {by ?? SOURCE_FA[m.source] ?? m.source} · {fmtDateTime(m.createdAt)}
                      {m.source !== "manual" && ` · منبع: ${SOURCE_FA[m.source] ?? m.source}`}
                    </div>
                  </li>
                ))}
              </ol>
              {!history.length && <p className={styles.muted}>هنوز مکاتبه‌ای ثبت نشده.</p>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
