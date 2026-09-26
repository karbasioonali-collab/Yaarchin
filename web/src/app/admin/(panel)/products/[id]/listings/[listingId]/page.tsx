import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, companyCorrespondence, productListings, products, users } from "@/db/schema";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import { RowsEditor } from "@/components/ui/RowsEditor";
import ui from "@/components/ui/ui.module.css";
import { can, requirePermission } from "@/lib/auth/can";
import { CHANNEL_FA, CURRENCY_FA, KIND_FA, SOURCE_FA } from "@/lib/catalog/admin-labels";
import { leadTimeHistory, priceHistory, priceText, qtyRange } from "@/lib/catalog/admin-listing";
import { catalogAdminReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum, UNITS, unitFa } from "@/lib/format";
import styles from "../../../../panel.module.css";
import { addLeadTimeBatchAction, addPriceBatchAction, updateListingAction } from "../../../actions";

export const metadata: Metadata = { title: "لیستینگ" };
const UUID = /^[0-9a-f-]{36}$/i;

// یک لیستینگ (کارخانه × محصول): مشخصات، ثبت نوبت تازه‌ی قیمت و زمان آماده‌سازی، و سابقه‌ی هر دو (فقط افزودنی).
export default async function ListingPage({ params }: PageProps<"/admin/products/[id]/listings/[listingId]">) {
  const a = await requirePermission("products.manage");
  const { id, listingId } = await params;
  if (!UUID.test(id) || !UUID.test(listingId)) notFound();
  const ready = await catalogAdminReady();
  const [l] = await db
    .select({
      id: productListings.id,
      companyId: productListings.companyId,
      companyName: companies.nameEn,
      productTitle: products.titleFa,
      priceUnit: products.priceUnit,
      externalUrl: productListings.externalUrl,
      titleEn: productListings.titleEn,
      moq: productListings.moq,
      moqUnit: productListings.moqUnit,
      leadTimeDays: productListings.leadTimeDays,
      status: productListings.status,
      source: productListings.source,
    })
    .from(productListings)
    .innerJoin(companies, eq(companies.id, productListings.companyId))
    .innerJoin(products, eq(products.id, productListings.productId))
    .where(and(eq(productListings.id, listingId), eq(productListings.productId, id)));
  if (!l) notFound();
  const seeCompanies = await can(a.user, "companies.view");
  const [prices, leads, msgs] = await Promise.all([
    priceHistory([l.id]),
    leadTimeHistory([l.id]),
    ready && seeCompanies
      ? db
          .select({ m: companyCorrespondence, by: users.fullName })
          .from(companyCorrespondence)
          .leftJoin(users, eq(users.id, companyCorrespondence.createdBy))
          .where(eq(companyCorrespondence.listingId, l.id))
          .orderBy(desc(companyCorrespondence.occurredAt))
          .limit(20)
      : Promise.resolve([]),
  ]);
  const priceBatches = prices.get(l.id) ?? [];
  const leadBatches = leads.get(l.id) ?? [];
  const companyName = seeCompanies ? l.companyName : "کارخانه (نام فقط با دسترسی «دیدن کارخانه‌ها»)";

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>
            {l.productTitle} · <span className={styles.ltr}>{companyName}</span>
          </h1>
          <p className={styles.pageSub}>
            <Link href="/admin/products">محصولات</Link> · <Link href={`/admin/products/${id}`}>{l.productTitle}</Link>
            {seeCompanies && (
              <>
                {" "}
                · <Link href={`/admin/companies/${l.companyId}`}>صفحه‌ی کارخانه</Link> · <Link href={`/admin/companies/${l.companyId}#correspondence`}>سابقه‌ی مکاتبه</Link>
              </>
            )}
            {l.externalUrl && (
              <>
                {" "}
                ·{" "}
                <a href={l.externalUrl} target="_blank" rel="noreferrer noopener">
                  علی‌بابا ↗
                </a>
              </>
            )}
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>ثبت قیمت جدید</h2>
          <p className={styles.muted} style={{ marginTop: 0 }}>
            قیمت‌های قبلی بازنویسی نمی‌شوند؛ این یک نوبت تازه است و سایت از آخرین نوبت استفاده می‌کند. قیمت هر {unitFa(l.priceUnit)}، به ارز اصلی (تبدیل به تومان هر بار با آخرین
            نرخ‌ها حساب می‌شود و ذخیره نمی‌شود).
          </p>
          <ActionForm action={addPriceBatchAction} submitLabel="ثبت قیمت">
            <input type="hidden" name="listingId" value={l.id} />
            <label className={ui.field}>
              <span className={ui.label}>ارز</span>
              <select name="currency" defaultValue="USD" className={ui.select}>
                <option value="USD">دلار (USD)</option>
                <option value="CNY">یوان (CNY) — تا مرحله‌ی نرخ‌ها در میانگین سایت نمی‌آید</option>
              </select>
            </label>
            <RowsEditor
              columns={[
                { name: "tierMin", label: "از تعداد", placeholder: "1", ltr: true, inputMode: "numeric" },
                { name: "tierMax", label: "تا تعداد", placeholder: "∞", ltr: true, inputMode: "numeric" },
                { name: "priceMin", label: "قیمت", placeholder: "6.80", ltr: true, inputMode: "decimal" },
                { name: "priceMax", label: "قیمت تا", placeholder: "اختیاری", ltr: true, inputMode: "decimal" },
              ]}
              addLabel="+ پله‌ی تعداد"
            />
            <p className={ui.hint} style={{ margin: 0 }}>
              بدون پله: فقط یک ردیف با «از» و «تا» خالی. «تا» خالی یعنی بدون سقف. «قیمت تا» برای وقتی است که علی‌بابا بازه نشان می‌دهد.
            </p>
            <Field label="یادداشت (اختیاری)" name="note" maxLength={500} />
          </ActionForm>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>ثبت زمان آماده‌سازی جدید</h2>
          {ready ? (
            <ActionForm action={addLeadTimeBatchAction} submitLabel="ثبت زمان آماده‌سازی">
              <input type="hidden" name="listingId" value={l.id} />
              <RowsEditor
                columns={[
                  { name: "ltMin", label: "از تعداد", placeholder: "1", ltr: true, inputMode: "numeric" },
                  { name: "ltMax", label: "تا تعداد", placeholder: "∞", ltr: true, inputMode: "numeric" },
                  { name: "ltDays", label: "روز", placeholder: "15", ltr: true, inputMode: "numeric" },
                ]}
                addLabel="+ پله‌ی تعداد"
              />
              <p className={ui.hint} style={{ margin: 0 }}>
                مثال: ۱ تا ۵۰۰ ← ۱۵ روز؛ ۵۰۱ به بالا («تا» خالی) ← ۳۰ روز.
              </p>
              <Field label="یادداشت (اختیاری)" name="note" maxLength={500} />
            </ActionForm>
          ) : (
            <p className={styles.muted}>بعد از اجرای migration ۰۰۰۴.</p>
          )}

          <h2 className={styles.cardTitle} style={{ marginTop: 20 }}>
            مشخصات لیستینگ
          </h2>
          <ActionForm action={updateListingAction} submitLabel="ذخیره" submitVariant="secondary">
            <input type="hidden" name="id" value={l.id} />
            <Field label="لینک محصول در علی‌بابا" name="externalUrl" defaultValue={l.externalUrl ?? ""} ltr maxLength={1000} />
            <Field label="عنوان انگلیسی در علی‌بابا" name="titleEn" defaultValue={l.titleEn ?? ""} ltr maxLength={300} />
            <div className={styles.row}>
              <Field label="حداقل سفارش" name="moq" defaultValue={l.moq ? String(l.moq) : ""} ltr inputMode="numeric" />
              <label className={ui.field}>
                <span className={ui.label}>واحد</span>
                <select name="moqUnit" defaultValue={l.moqUnit ?? "piece"} className={ui.select}>
                  {Object.entries(UNITS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className={ui.field}>
                <span className={ui.label}>وضعیت</span>
                <select name="status" defaultValue={l.status} className={ui.select}>
                  <option value="active">فعال (در محاسبه‌ی سایت)</option>
                  <option value="inactive">غیرفعال (حساب نمی‌شود)</option>
                </select>
              </label>
            </div>
          </ActionForm>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>سابقه‌ی قیمت ({fmtNum(priceBatches.length)} نوبت)</h2>
          {priceBatches.map((b, i) => (
            <div key={i} className={styles.batch}>
              <div className={styles.timelineHead}>
                <strong>{fmtDateTime(b.observedAt)}</strong>
                <span className={styles.badge}>{CURRENCY_FA[b.currency]}</span>
                {i === priceBatches.findIndex((x) => x.currency === b.currency) && <span className={styles.badge}>آخرین نوبت</span>}
                {b.source !== "manual" && <span className={`${styles.badge} ${styles.badgeMuted}`}>{SOURCE_FA[b.source] ?? b.source}</span>}
              </div>
              {b.tiers.map((t, k) => (
                <div key={k}>
                  {qtyRange(t)}: {priceText(t)} {CURRENCY_FA[b.currency]}
                </div>
              ))}
              {b.note && <div className={styles.muted}>{b.note}</div>}
            </div>
          ))}
          {!priceBatches.length && <p className={styles.muted}>هنوز قیمتی ثبت نشده.</p>}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>سابقه‌ی زمان آماده‌سازی ({fmtNum(leadBatches.length)} نوبت)</h2>
          {leadBatches.map((b, i) => (
            <div key={i} className={styles.batch}>
              <div className={styles.timelineHead}>
                <strong>{fmtDateTime(b.observedAt)}</strong>
                {i === 0 && <span className={styles.badge}>آخرین نوبت</span>}
              </div>
              {b.tiers.map((t, k) => (
                <div key={k}>
                  {qtyRange(t)}: {fmtNum(t.days)} روز
                </div>
              ))}
              {b.note && <div className={styles.muted}>{b.note}</div>}
            </div>
          ))}
          {!leadBatches.length && (
            <p className={styles.muted}>{l.leadTimeDays ? `پله‌ای ثبت نشده؛ سایت از مقدار قدیمی ${fmtNum(l.leadTimeDays)} روز استفاده می‌کند.` : "هنوز ثبت نشده."}</p>
          )}
        </div>

        {seeCompanies && (
          <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
            <h2 className={styles.cardTitle}>مکاتبه درباره‌ی همین محصول</h2>
            {msgs.map(({ m, by }) => (
              <div key={m.id} className={styles.timelineItem} style={{ marginBottom: 8 }}>
                <div className={styles.timelineHead}>
                  <span className={styles.mono}>#{m.id}</span>
                  <strong>{fmtDateTime(m.occurredAt)}</strong>
                  <span className={styles.badge}>{KIND_FA[m.kind]}</span>
                  <span className={`${styles.badge} ${styles.badgeMuted}`}>{CHANNEL_FA[m.channel]}</span>
                  <span className={styles.muted}>{by ?? SOURCE_FA[m.source]}</span>
                </div>
                <div className={styles.timelineBody}>{m.body}</div>
              </div>
            ))}
            {!msgs.length && <p className={styles.muted}>مکاتبه‌ای با اشاره به این محصول ثبت نشده.</p>}
            <Link href={`/admin/companies/${l.companyId}#correspondence`}>همه‌ی مکاتبه‌های این کارخانه و ثبت مکاتبه‌ی تازه ←</Link>
          </div>
        )}
      </div>
    </>
  );
}
