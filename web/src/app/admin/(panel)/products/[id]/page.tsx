import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray, max, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, companyCorrespondence, productListings, productMedia, products } from "@/db/schema";
import { ActionForm } from "@/components/ui/ActionForm";
import { Checkbox, Field } from "@/components/ui/Field";
import { RowsEditor } from "@/components/ui/RowsEditor";
import ui from "@/components/ui/ui.module.css";
import { can, requirePermission } from "@/lib/auth/can";
import { COMPANY_STATUS_FA, CURRENCY_FA, LISTING_STATUS_FA, PRODUCT_STATUS_FA } from "@/lib/catalog/admin-labels";
import { latestByCurrency, leadTimeHistory, priceHistory, priceText, qtyRange } from "@/lib/catalog/admin-listing";
import { adminCategoryTree } from "@/lib/catalog/admin-tree";
import { catalogAdminReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum, UNITS, unitFa } from "@/lib/format";
import { mediaUrl } from "@/lib/storage";
import styles from "../../panel.module.css";
import { addMediaAction, createListingAction, mediaCommandAction, updateProductAction } from "../actions";
import { ProductFields } from "../ProductFields";

export const metadata: Metadata = { title: "محصول" };
const UUID = /^[0-9a-f-]{36}$/i;

type Spec = { labelFa?: string; valueFa?: string; unit?: string };

export default async function ProductPage({ params }: PageProps<"/admin/products/[id]">) {
  const a = await requirePermission("products.manage");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ready = await catalogAdminReady();
  const [p] = await db
    .select({
      id: products.id,
      slug: products.slug,
      titleFa: products.titleFa,
      titleEn: products.titleEn,
      categoryId: products.categoryId,
      summaryFa: products.summaryFa,
      descriptionFa: products.descriptionFa,
      specs: products.specs,
      priceUnit: products.priceUnit,
      hsCode: products.hsCode,
      status: products.status,
      source: products.source,
      publishedAt: products.publishedAt,
      ...(ready
        ? {
            unitWeightKg: products.unitWeightKg,
            cartonLengthCm: products.cartonLengthCm,
            cartonWidthCm: products.cartonWidthCm,
            cartonHeightCm: products.cartonHeightCm,
            cartonWeightKg: products.cartonWeightKg,
            unitsPerCarton: products.unitsPerCarton,
          }
        : {}),
    })
    .from(products)
    .where(eq(products.id, id));
  if (!p) notFound();

  const seeCompanies = await can(a.user, "companies.view");
  const [tree, media, listings] = await Promise.all([
    adminCategoryTree(),
    db.select().from(productMedia).where(eq(productMedia.productId, id)).orderBy(asc(productMedia.sortOrder), asc(productMedia.createdAt)),
    db
      .select({
        id: productListings.id,
        companyId: productListings.companyId,
        companyName: companies.nameEn,
        companyStatus: companies.status,
        externalUrl: productListings.externalUrl,
        moq: productListings.moq,
        moqUnit: productListings.moqUnit,
        leadTimeDays: productListings.leadTimeDays,
        status: productListings.status,
      })
      .from(productListings)
      .innerJoin(companies, eq(companies.id, productListings.companyId))
      .where(eq(productListings.productId, id))
      .orderBy(asc(productListings.createdAt)),
  ]);
  const lids = listings.map((l) => l.id);
  const [prices, leads, lastMsgs, companyOptions] = await Promise.all([
    priceHistory(lids),
    leadTimeHistory(lids),
    ready && seeCompanies && listings.length
      ? db
          .select({ companyId: companyCorrespondence.companyId, at: max(companyCorrespondence.occurredAt) })
          .from(companyCorrespondence)
          .where(inArray(companyCorrespondence.companyId, [...new Set(listings.map((l) => l.companyId))]))
          .groupBy(companyCorrespondence.companyId)
      : Promise.resolve([]),
    seeCompanies
      ? db.select({ id: companies.id, nameEn: companies.nameEn }).from(companies).where(ne(companies.status, "merged")).orderBy(asc(companies.nameEn))
      : Promise.resolve([]),
  ]);
  const lastMsgOf = new Map(lastMsgs.map((m) => [m.companyId, m.at]));
  // بدون دسترسی «دیدن کارخانه‌ها» اسم کارخانه نمایش داده نمی‌شود
  const companyLabel = (l: (typeof listings)[number], i: number) => (seeCompanies ? l.companyName : `کارخانه‌ی ${fmtNum(i + 1)}`);
  const specs = (Array.isArray(p.specs) ? (p.specs as Spec[]) : []).map((s) => ({ specLabel: s.labelFa ?? "", specValue: s.valueFa ?? "", specUnit: s.unit ?? "" }));
  // numeric از دیتابیس رشته با صفرهای اضافه می‌آید («19.000»)؛ برای فرم عدد ساده
  const pk = (k: string) => {
    const v = "unitWeightKg" in p ? (p as Record<string, unknown>)[k] : null;
    return v === null || v === undefined ? "" : String(Number(v));
  };

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{p.titleFa}</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/products">محصولات</Link> · {PRODUCT_STATUS_FA[p.status]}
            {p.source === "demo" && " · داده‌ی نمونه"} ·{" "}
            {p.status === "published" ? (
              <Link href={`/p/${p.slug}`} target="_blank">
                دیدن در سایت ↗
              </Link>
            ) : (
              "در سایت دیده نمی‌شود"
            )}
          </p>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>مشخصات محصول</h2>
        <ActionForm action={updateProductAction} submitLabel="ذخیره‌ی محصول">
          <input type="hidden" name="id" value={p.id} />
          <ProductFields tree={tree} value={p} />
          <div className={ui.field}>
            <span className={ui.label}>مشخصات مشترک (در صفحه‌ی محصول نمایش داده می‌شود)</span>
            <RowsEditor
              columns={[
                { name: "specLabel", label: "عنوان", placeholder: "مثلاً حجم" },
                { name: "specValue", label: "مقدار", placeholder: "۳۸۰" },
                { name: "specUnit", label: "واحد", placeholder: "میلی‌لیتر", width: "0.7fr" },
              ]}
              initial={specs}
              addLabel="+ ردیف مشخصات"
            />
          </div>
          {ready ? (
            <div className={ui.field}>
              <span className={ui.label}>وزن و بسته‌بندی (برای ماشین‌حساب هزینه‌ی حمل؛ همه اختیاری)</span>
              <div className={styles.row}>
                <Field label="وزن هر عدد (kg)" name="unitWeightKg" defaultValue={pk("unitWeightKg")} ltr inputMode="decimal" />
                <Field label="تعداد در کارتن" name="unitsPerCarton" defaultValue={pk("unitsPerCarton")} ltr inputMode="numeric" />
                <Field label="وزن کارتن پر (kg)" name="cartonWeightKg" defaultValue={pk("cartonWeightKg")} ltr inputMode="decimal" />
              </div>
              <div className={styles.row}>
                <Field label="طول کارتن (cm)" name="cartonLengthCm" defaultValue={pk("cartonLengthCm")} ltr inputMode="decimal" />
                <Field label="عرض کارتن (cm)" name="cartonWidthCm" defaultValue={pk("cartonWidthCm")} ltr inputMode="decimal" />
                <Field label="ارتفاع کارتن (cm)" name="cartonHeightCm" defaultValue={pk("cartonHeightCm")} ltr inputMode="decimal" />
              </div>
            </div>
          ) : (
            <p className={styles.muted}>فیلدهای وزن و کارتن بعد از اجرای migration ۰۰۰۴.</p>
          )}
        </ActionForm>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <h2 className={styles.cardTitle}>عکس و ویدیو ({fmtNum(media.length)})</h2>
        <p className={styles.muted} style={{ marginTop: 0 }}>
          فعلاً با آدرس (آپلود در مرحله‌ی بعد). «منتشر نشود» برای عکسی است که لوگو یا اسم کارخانه دارد: در پنل می‌ماند ولی هرگز در سایت نمایش داده نمی‌شود.
        </p>
        <div className={styles.mediaGrid}>
          {media.map((m, i) => (
            <div key={m.id} className={styles.mediaItem}>
              {m.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(m.storageKey) ?? ""} alt={m.altFa ?? ""} loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <div className={styles.mediaVideo}>🎬 ویدیو</div>
              )}
              <div className={styles.mediaMeta}>
                {m.isPublic ? <span className={styles.badge}>در سایت</span> : <span className={`${styles.badge} ${styles.badgeWarn}`}>منتشر نشود (لوگو)</span>}
                <div className={`${styles.ltr} ${styles.muted}`} style={{ fontSize: 11, overflowWrap: "anywhere" }}>
                  {m.storageKey}
                </div>
              </div>
              <div className={styles.mediaActions}>
                {(
                  [
                    ["toggle", m.isPublic ? "منتشر نشود" : "انتشار"],
                    ["up", "↑"],
                    ["down", "↓"],
                    ["delete", "حذف"],
                  ] as const
                ).map(([cmd, label]) => (
                  <form key={cmd} action={mediaCommandAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="cmd" value={cmd} />
                    <button type="submit" className={styles.btnGhost} disabled={(cmd === "up" && i === 0) || (cmd === "down" && i === media.length - 1)}>
                      {label}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </div>
        <details className={styles.detailsBox} style={{ marginTop: 12 }}>
          <summary>+ افزودن عکس یا ویدیو</summary>
          <ActionForm action={addMediaAction} submitLabel="افزودن" submitVariant="secondary">
            <input type="hidden" name="productId" value={p.id} />
            <div className={styles.row}>
              <label className={ui.field}>
                <span className={ui.label}>نوع</span>
                <select name="kind" defaultValue="image" className={ui.select}>
                  <option value="image">عکس</option>
                  <option value="video">ویدیو</option>
                </select>
              </label>
              <label className={ui.field}>
                <span className={ui.label}>از لیستینگ کدام کارخانه (اختیاری)</span>
                <select name="listingId" defaultValue="" className={ui.select}>
                  <option value="">—</option>
                  {listings.map((l, i) => (
                    <option key={l.id} value={l.id}>
                      {companyLabel(l, i)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Field label="آدرس فایل" name="url" ltr required maxLength={1000} hint="https://…" />
            <Field label="آدرس عکس پیش‌نمایش (فقط ویدیو)" name="poster" ltr maxLength={1000} />
            <Field label="توضیح عکس (alt)" name="altFa" maxLength={200} />
            <Checkbox name="hasLogo" value="yes" label="دارای لوگوی کارخانه — منتشر نشود" />
          </ActionForm>
        </details>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <h2 className={styles.cardTitle}>کارخانه‌های این محصول ({fmtNum(listings.length)})</h2>
        <p className={styles.muted} style={{ marginTop: 0 }}>
          سایت میانگین و بازه‌ی قیمت، حداقل سفارش و زمان آماده‌سازی را خودکار از آخرین قیمت‌های لیستینگ‌های فعالِ کارخانه‌های فعال حساب می‌کند. قیمت یوانی تا مرحله‌ی نرخ‌ها در
          میانگین سایت نمی‌آید.
        </p>
        {listings.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>کارخانه</th>
                  <th>آخرین قیمت</th>
                  <th>حداقل سفارش</th>
                  <th>زمان آماده‌سازی</th>
                  {seeCompanies && <th>آخرین مکاتبه</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {listings.map((l, i) => {
                  const lt = leads.get(l.id)?.[0];
                  const batches = latestByCurrency(prices.get(l.id));
                  return (
                    <tr key={l.id}>
                      <td>
                        {seeCompanies ? (
                          <Link href={`/admin/companies/${l.companyId}`} className={styles.ltr}>
                            {companyLabel(l, i)}
                          </Link>
                        ) : (
                          companyLabel(l, i)
                        )}
                        <div>
                          {l.status !== "active" && <span className={`${styles.badge} ${styles.badgeWarn}`}>لیستینگ {LISTING_STATUS_FA[l.status]}</span>}
                          {l.companyStatus !== "active" && <span className={`${styles.badge} ${styles.badgeWarn}`}>کارخانه {COMPANY_STATUS_FA[l.companyStatus]}</span>}
                        </div>
                      </td>
                      <td>
                        {batches.map((b) => (
                          <div key={b.currency}>
                            {b.tiers.map((t, k) => (
                              <div key={k}>
                                {qtyRange(t)}: <strong>{priceText(t)}</strong> {CURRENCY_FA[b.currency]}
                              </div>
                            ))}
                            <div className={styles.muted} style={{ fontSize: 12 }}>
                              {fmtDateTime(b.observedAt)}
                              {b.currency === "CNY" && " · در میانگین سایت نمی‌آید"}
                            </div>
                          </div>
                        ))}
                        {!batches.length && <span className={styles.muted}>قیمت ثبت نشده</span>}
                      </td>
                      <td>{l.moq ? `${fmtNum(l.moq)} ${unitFa(l.moqUnit ?? "piece")}` : "—"}</td>
                      <td>
                        {lt
                          ? lt.tiers.map((t, k) => (
                              <div key={k}>
                                {qtyRange(t)}: {fmtNum(t.days)} روز
                              </div>
                            ))
                          : l.leadTimeDays
                            ? `${fmtNum(l.leadTimeDays)} روز`
                            : "—"}
                      </td>
                      {seeCompanies && (
                        <td>
                          {lastMsgOf.get(l.companyId) ? (
                            <Link href={`/admin/companies/${l.companyId}#correspondence`}>{fmtDateTime(lastMsgOf.get(l.companyId))}</Link>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                      )}
                      <td>
                        <Link href={`/admin/products/${p.id}/listings/${l.id}`} className={styles.btnGhost}>
                          قیمت و جزئیات
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.muted}>هنوز کارخانه‌ای برای این محصول ثبت نشده.</p>
        )}
        {seeCompanies ? (
          <details className={styles.detailsBox} style={{ marginTop: 12 }}>
            <summary>+ افزودن کارخانه (لیستینگ)</summary>
            <ActionForm action={createListingAction} submitLabel="افزودن" submitVariant="secondary">
              <input type="hidden" name="productId" value={p.id} />
              <label className={ui.field}>
                <span className={ui.label}>کارخانه</span>
                <select name="companyId" required defaultValue="" className={ui.select}>
                  <option value="" disabled>
                    انتخاب کنید…
                  </option>
                  {companyOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameEn}
                    </option>
                  ))}
                </select>
                <span className={ui.hint}>
                  کارخانه در فهرست نیست؟ اول در <Link href="/admin/companies/new">کارخانه‌ها</Link> ثبتش کنید.
                </span>
              </label>
              <Field label="لینک محصول در علی‌بابا" name="externalUrl" ltr maxLength={1000} hint="https://…" />
              <Field label="عنوان انگلیسی در علی‌بابا" name="titleEn" ltr maxLength={300} />
              <div className={styles.row}>
                <Field label="حداقل سفارش" name="moq" ltr inputMode="numeric" />
                <label className={ui.field}>
                  <span className={ui.label}>واحد</span>
                  <select name="moqUnit" defaultValue={p.priceUnit} className={ui.select}>
                    {Object.entries(UNITS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className={ui.hint} style={{ margin: 0 }}>
                قیمت و زمان آماده‌سازی در صفحه‌ی بعد ثبت می‌شود.
              </p>
            </ActionForm>
          </details>
        ) : (
          <p className={styles.muted}>برای افزودن کارخانه دسترسی «دیدن کارخانه‌ها» هم لازم است.</p>
        )}
      </div>
    </>
  );
}
