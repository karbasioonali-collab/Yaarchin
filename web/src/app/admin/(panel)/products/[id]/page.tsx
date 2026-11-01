import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, max, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, companyCorrespondence, companyExternalIds, mediaFiles, productListings, productMedia, products } from "@/db/schema";
import { ActionForm } from "@/components/ui/ActionForm";
import { Checkbox, Field } from "@/components/ui/Field";
import { RowsEditor } from "@/components/ui/RowsEditor";
import ui from "@/components/ui/ui.module.css";
import { can, requirePermission } from "@/lib/auth/can";
import { COMPANY_STATUS_FA, COMPANY_TYPE_FA, CURRENCY_FA, LISTING_STATUS_FA, PRODUCT_STATUS_FA } from "@/lib/catalog/admin-labels";
import { latestByCurrency, leadTimeHistory, priceHistory, priceText, qtyRange } from "@/lib/catalog/admin-listing";
import { adminCategoryTree } from "@/lib/catalog/admin-tree";
import { catalogAdminReady, catalogTextReady, mediaReady, ratesReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum, fmtUsd, UNITS, unitFa } from "@/lib/format";
import { isUploadKey, mediaUrl } from "@/lib/storage";
import styles from "../../panel.module.css";
import {
  addMediaAction,
  applyDraftSpecsAction,
  applySpecsAction,
  createListingAction,
  mediaBulkAction,
  mediaCommandAction,
  runTextDraftAction,
  setPosterAction,
  setReferenceQtyAction,
  updateProductAction,
} from "../actions";
import { FillFieldButton } from "../FillFieldButton";
import { draftsOf, prepareDraft } from "@/lib/catalog/text-draft";
import { HIT_FA, type DraftHit, type DraftOutput } from "@/lib/catalog/text-draft-core";
import { adminReference } from "@/lib/catalog/admin-reference";
import { mergeSpecs } from "@/lib/import/merge-specs";
import { suggestPacking } from "@/lib/catalog/packing-suggest";
import { DB_MEDIA_PREFIX } from "@/lib/import/register";
import { MediaModeNote } from "@/components/admin/MediaModeNote";
import { ProductMediaUploader } from "@/components/admin/ProductMediaUploader";
import { ProductUrlImporter } from "@/components/admin/ProductUrlImporter";
import { UploadImageField } from "@/components/admin/UploadImageField";
import { mediaLimits } from "@/lib/media/service";
import { ProductFields } from "../ProductFields";
import { hsLookup } from "@/lib/pricing/admin";

export const metadata: Metadata = { title: "محصول" };
const UUID = /^[0-9a-f-]{36}$/i;

type Spec = { labelFa?: string; valueFa?: string; unit?: string };

export default async function ProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const a = await requirePermission("products.manage");
  const { id } = await params;
  const sp = await searchParams;
  const justCreated = sp.created === "1";
  const aiConfirm = sp.aiText === "confirm";
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
  const [uploads, limits] = await Promise.all([mediaReady(), mediaLimits()]);
  const videoMaxMb = limits.mode === "local" ? Math.min(limits.videoMaxMb, limits.testVideoMaxMb) : limits.videoMaxMb;
  const [tree, media, listings] = await Promise.all([
    adminCategoryTree(),
    db.select().from(productMedia).where(eq(productMedia.productId, id)).orderBy(asc(productMedia.sortOrder), asc(productMedia.createdAt)),
    db
      .select({
        id: productListings.id,
        companyId: productListings.companyId,
        companyName: companies.nameEn,
        companyStatus: companies.status,
        companyType: companies.companyType,
        companyMeta: companies.meta,
        specs: productListings.specs,
        meta: productListings.meta,
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
  // جدول کارخانه‌ها: لینک پروفایل علی‌بابا و صفحه‌ی محصول فقط با companies.links (تب تازه)
  const seeLinks = seeCompanies && (await can(a.user, "companies.links"));
  const profiles = new Map(
    seeLinks && listings.length
      ? (
          await db
            .select({ companyId: companyExternalIds.companyId, url: companyExternalIds.url })
            .from(companyExternalIds)
            .where(and(inArray(companyExternalIds.companyId, [...new Set(listings.map((l) => l.companyId))]), eq(companyExternalIds.platform, "alibaba")))
        ).map((x) => [x.companyId, x.url])
      : [],
  );
  const ref = await adminReference(id);
  const usedOf = new Map((ref.price?.used ?? []).map((o) => [o.listingId, o]));
  const excludedOf = new Map((ref.price?.excluded ?? []).map((o) => [o.listingId, o]));
  // مشخصات ترکیبی از specs.attributes لیستینگ‌ها (ورود از علی‌بابا)
  const attrsOf = (sp: unknown) => {
    const at = (sp as { attributes?: unknown } | null)?.attributes;
    return Array.isArray(at)
      ? ((at as { name?: unknown; value?: unknown }[]).filter((x) => typeof x?.name === "string" && typeof x?.value === "string") as { name: string; value: string }[])
      : [];
  };
  const specListings = listings.filter((l) => attrsOf(l.specs).length);
  const merged = mergeSpecs(specListings.map((l) => ({ listingId: l.id, attributes: attrsOf(l.specs) })));
  const listingIndex = new Map(listings.map((l, i) => [l.id, i]));
  // بدون HS یا HS خارج از لیست: سایت فقط «کالا + حمل تا مرز ایران» نشان می‌دهد (بخش ۴۱)
  const ratesOn = await ratesReady();
  const hsCurrent = ratesOn && p.hsCode ? await hsLookup(p.hsCode) : null;
  const hsWarn = !ratesOn
    ? null
    : p.hsCode && !hsCurrent
      ? `HS این محصول (${p.hsCode}) در لیست HS نیست؛ تا اصلاح نشود، سایت فقط «قیمت کالا و حمل تا مرز ایران» را نشان می‌دهد.`
      : !p.hsCode
        ? "HS این محصول ثبت نشده؛ سایت فقط «قیمت کالا و حمل تا مرز ایران» را نشان می‌دهد (بدون گمرک، ترخیص و بیمه)."
        : null;
  // متن فارسی با AI (migration ۰۰۱۴؛ بخش ۴۰)
  const textOn = await catalogTextReady();
  const [drafts, prep] = textOn ? await Promise.all([draftsOf(id, 3), aiConfirm ? prepareDraft(id) : Promise.resolve(null)]) : [[], null];
  // بدون دسترسی «دیدن کارخانه‌ها» اسم کارخانه نمایش داده نمی‌شود
  const companyLabel = (l: (typeof listings)[number], i: number) => (seeCompanies ? l.companyName : `کارخانه‌ی ${fmtNum(i + 1)}`);
  // «پیشنهاد از مشخصات» برای خانه‌های خالی بسته‌بندی (بخش ۴۱؛ هیچ‌چیز خودکار پر نمی‌شود)
  const numOrNull = (k: string) => {
    const v = "unitWeightKg" in p ? (p as Record<string, unknown>)[k] : null;
    return v === null || v === undefined ? null : Number(v);
  };
  const packSuggest = suggestPacking(
    listings.filter((l) => l.status === "active").map((l, i) => ({ label: companyLabel(l, listingIndex.get(l.id) ?? i), meta: l.meta, specs: l.specs })),
    {
      unitWeightKg: numOrNull("unitWeightKg"),
      unitsPerCarton: numOrNull("unitsPerCarton"),
      cartonWeightKg: numOrNull("cartonWeightKg"),
      cartonLengthCm: numOrNull("cartonLengthCm"),
      cartonWidthCm: numOrNull("cartonWidthCm"),
      cartonHeightCm: numOrNull("cartonHeightCm"),
    },
  );
  const PACK_FA = { unitWeightKg: "وزن هر عدد", unitsPerCarton: "تعداد در کارتن", cartonWeightKg: "وزن کارتن پر", cartonDims: "ابعاد کارتن" } as const;
  // فایل‌های واردشده از لینک یا اکستنشن (برای برچسب «از لینک» و لینک منبع)
  const uploadKeys = media.map((m) => m.storageKey).filter((k) => isUploadKey(k));
  const imported = new Map(
    uploads && uploadKeys.length
      ? (
          await db
            .select({ key: mediaFiles.key, source: mediaFiles.source, sourceUrl: mediaFiles.sourceUrl })
            .from(mediaFiles)
            .where(and(inArray(mediaFiles.key, uploadKeys), ne(mediaFiles.source, "upload")))
        ).map((f) => [f.key, f])
      : [],
  );
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

      {hsWarn && (
        <div className={styles.rateWarn} role="status" data-testid="hs-warning">
          <span>{hsWarn}</span>
        </div>
      )}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>مشخصات محصول</h2>
        <ActionForm action={updateProductAction} submitLabel="ذخیره‌ی محصول">
          <input type="hidden" name="id" value={p.id} />
          <ProductFields tree={tree} value={p} hs={{ ready: ratesOn, current: hsCurrent }} canPublish={await can(a.user, "products.publish")} />
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
              {(packSuggest.suggestions.length > 0 || packSuggest.unitDims.length > 0) && (
                <div className={styles.notice} data-testid="packing-suggest" style={{ fontSize: 13 }}>
                  <strong>پیشنهاد از مشخصات</strong> (برای خانه‌های خالی؛ با «استفاده» فقط خانه پر می‌شود و با «ذخیره‌ی محصول» ذخیره)
                  {packSuggest.suggestions.map((sg) => (
                    <div key={`${sg.key}${sg.text}`} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 }} data-testid={`suggest-${sg.key}`}>
                      <span>
                        {PACK_FA[sg.key]}: <span className={styles.ltr}>{sg.text}</span>
                        {sg.estimated && <span className={`${styles.badge} ${styles.badgeWarn}`}>تخمینی</span>}
                        <span className={styles.muted}> ({sg.sources.join("، ")})</span>
                      </span>
                      <FillFieldButton values={sg.fields} label="استفاده" className={styles.btnGhost} />
                    </div>
                  ))}
                  {packSuggest.unitDims.map((u) => (
                    <div key={u.text} className={styles.muted} style={{ marginTop: 4 }} data-testid="suggest-unitDims">
                      ابعاد بسته‌ی تکی: <span className={styles.ltr}>{u.text}</span> ({u.sources.join("، ")}) — برای تخمین ابعاد کارتن «تعداد در کارتن» لازم است.
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className={styles.muted}>فیلدهای وزن و کارتن بعد از اجرای migration ۰۰۰۴.</p>
          )}
        </ActionForm>
      </div>

      <div id="ai-text" className={styles.card} style={{ marginTop: 16, scrollMarginTop: 16 }} data-testid="ai-text">
        <h2 className={styles.cardTitle}>متن فارسی با AI</h2>
        {!textOn ? (
          <p className={styles.muted}>این بخش بعد از اجرای migration ۰۰۱۴ فعال می‌شود.</p>
        ) : (
          <>
            <p className={styles.muted} style={{ marginTop: 0 }}>
              پیش‌نویس اسم فارسی، خلاصه، توضیحات و ترجمه‌ی مشخصات از اسم انگلیسی، Highlights واقعی و مشخصات لیستینگ‌ها. اسم، برند، شهر و هر اطلاعات کارخانه، متن «About» و قیمت‌ها
              فرستاده نمی‌شوند؛ محافظ خروجی هم روی متن اجرا می‌شود. نتیجه فقط پیش‌نویس است و تا شما در فرم بالا «ذخیره‌ی محصول» نزنید چیزی عوض نمی‌شود.
            </p>
            {prep ? (
              <div className={styles.notice} data-testid="ai-text-confirm">
                <div>
                  فرستاده می‌شود: {fmtNum(prep.input.titles.length)} اسم انگلیسی | {fmtNum(prep.input.highlights.length)} ویژگی | {fmtNum(prep.input.specs.length)} ردیف مشخصات برای
                  ترجمه. {fmtNum(prep.input.localSpecs.length)} ردیف را واژه‌نامه رایگان ترجمه کرد (به AI نمی‌رود).
                </div>
                <div style={{ marginTop: 4 }}>
                  {prep.live ? (
                    <>
                      هزینه‌ی تخمینی: <strong data-testid="ai-text-estimate">{fmtNum(prep.estimateToman)} تومان</strong> (حدود {fmtNum(prep.tokens.prompt + prep.tokens.completion)}{" "}
                      توکن؛ مدل <span className={styles.ltr}>{prep.model}</span>) | باقی‌مانده‌ی سقف امروز: {fmtNum(Math.round(prep.remainingToman))} از {fmtNum(prep.capToman)}{" "}
                      تومان
                    </>
                  ) : (
                    "حالت آزمایشی (کلید AI تنظیم نشده): فقط مشخصاتِ واژه‌نامه ساخته می‌شود؛ هزینه ندارد. برای متن کامل کلید AI لازم است."
                  )}
                </div>
                <details style={{ marginTop: 6 }}>
                  <summary className={styles.muted}>دیدن دقیق آنچه فرستاده می‌شود</summary>
                  <pre dir="ltr" style={{ whiteSpace: "pre-wrap", fontSize: 12 }} data-testid="ai-text-input">
                    {[...prep.input.titles, ...prep.input.highlights, ...prep.input.specs.map((x) => `${x.name}: ${x.value}`)].join("\n")}
                  </pre>
                </details>
                {prep.live && prep.estimateToman > prep.remainingToman ? (
                  <p className={styles.error} role="alert">
                    هزینه‌ی تخمینی از باقی‌مانده‌ی سقف روزانه بیشتر است؛ سقف را در صفحه‌ی دستیار بالا ببرید یا فردا امتحان کنید.
                  </p>
                ) : (
                  <ActionForm action={runTextDraftAction} submitLabel="اجرا و ساخت پیش‌نویس">
                    <input type="hidden" name="id" value={p.id} />
                  </ActionForm>
                )}
                <Link href={`/admin/products/${p.id}#ai-text`}>انصراف</Link>
              </div>
            ) : (
              <Link href={`/admin/products/${p.id}?aiText=confirm#ai-text`} className={styles.btn}>
                پیش‌نویس با AI (اول هزینه‌ی تخمینی)
              </Link>
            )}
            {drafts.map((d) => {
              const out = (d.status === "ready" || d.status === "blocked" ? d.output : null) as DraftOutput | null;
              const hits = (d.guardHits ?? []) as DraftHit[];
              const usable = d.status === "ready";
              return (
                <div key={d.id} className={styles.detailsBox} style={{ marginTop: 12 }} data-testid="ai-draft">
                  <div>
                    <span className={`${styles.badge} ${usable ? "" : styles.badgeWarn}`}>
                      {usable ? "پیش‌نویس آماده" : d.status === "blocked" ? "رد شد (قابل استفاده نیست)" : "خطا"}
                    </span>{" "}
                    <span className={styles.muted} style={{ fontSize: 12 }}>
                      {fmtDateTime(d.createdAt)} | {d.model ? <span className={styles.ltr}>{d.model}</span> : "حالت آزمایشی"} | هزینه {fmtNum(Number(d.costToman))} تومان
                    </span>
                  </div>
                  {hits.length > 0 && (
                    <p className={styles.error} data-testid="ai-draft-hits">
                      رد شد: {hits.map((h) => `${HIT_FA[h.type] ?? h.type} «${h.type === "number" ? fmtNum(Number(h.match)) : h.match}»`).join("، ")}
                    </p>
                  )}
                  {d.status === "error" && <p className={styles.error}>مدل جواب نداد یا قالب جواب نادرست بود؛ دوباره امتحان کنید.</p>}
                  {out && (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>فیلد</th>
                            <th>الان</th>
                            <th>پیش‌نویس</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {(
                            [
                              ["titleFa", "اسم فارسی", p.titleFa, out.titleFa],
                              ["summaryFa", "خلاصه", p.summaryFa ?? "", out.summaryFa],
                              ["descriptionFa", "توضیحات", p.descriptionFa ?? "", out.descriptionFa],
                            ] as const
                          ).map(([name, label, cur, draft]) => (
                            <tr key={name} data-testid={`ai-field-${name}`}>
                              <td>{label}</td>
                              <td style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{cur || <span className={styles.muted}>—</span>}</td>
                              <td style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{draft || <span className={styles.muted}>—</span>}</td>
                              <td>{usable && draft && <FillFieldButton name={name} value={draft} className={styles.btnGhost} />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {out && out.specs.length > 0 && (
                    <>
                      <div style={{ fontSize: 13, marginTop: 6 }} data-testid="ai-draft-specs">
                        مشخصات: {out.specs.map((x) => `${x.labelFa}: ${x.valueFa}${x.unit ? ` ${x.unit}` : ""}`).join(" | ")}
                      </div>
                      {usable && (
                        <ActionForm action={applyDraftSpecsAction} submitLabel="افزودن این مشخصات به مشخصات مشترک" submitVariant="secondary">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="draftId" value={d.id} />
                        </ActionForm>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {merged.length > 0 && (
        <div className={styles.card} style={{ marginTop: 16 }} data-testid="specs-merge">
          <h2 className={styles.cardTitle}>مشخصات ترکیبی لیستینگ‌ها</h2>
          <p className={styles.muted} style={{ marginTop: 0 }}>
            ویژگی‌های {fmtNum(specListings.length)} لیستینگ کنار هم. تیک بزنید کدام در «مشخصات مشترک» صفحه‌ی محصول بیاید؛ ترجمه از واژه‌نامه‌ی ثابت است و قبل از ذخیره قابل اصلاح
            است. برند، محل تولید و مدل اطلاعات کارخانه‌اند و انتخاب نمی‌شوند.
          </p>
          <ActionForm action={applySpecsAction} submitLabel="افزودن انتخاب‌شده‌ها به مشخصات مشترک" submitVariant="secondary">
            <input type="hidden" name="id" value={p.id} />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th />
                    <th>ویژگی</th>
                    {specListings.map((l) => (
                      <th key={l.id}>{companyLabel(l, listingIndex.get(l.id)!)}</th>
                    ))}
                    <th>در صفحه‌ی محصول (عنوان | مقدار | واحد)</th>
                  </tr>
                </thead>
                <tbody>
                  {merged.map((r, k) => (
                    <tr key={r.key} data-testid="merge-row">
                      <td>{!r.supplierInfo && <input type="checkbox" name="pick" value={k} aria-label={r.name} />}</td>
                      <td dir="ltr">
                        {r.name}
                        <div>
                          {r.supplierInfo ? (
                            <span className={`${styles.badge} ${styles.badgeMuted}`}>اطلاعات کارخانه</span>
                          ) : r.common ? (
                            <span className={styles.badge}>مشترک</span>
                          ) : (
                            <span className={`${styles.badge} ${styles.badgeWarn}`}>متفاوت</span>
                          )}
                        </div>
                      </td>
                      {r.values.map((v, j) => (
                        <td key={j} dir="ltr" style={{ fontSize: 13 }}>
                          {v ?? <span className={styles.muted}>—</span>}
                        </td>
                      ))}
                      <td>
                        {!r.supplierInfo && (
                          <div style={{ display: "flex", gap: 4 }}>
                            <input name={`label_${k}`} defaultValue={r.suggestion.labelFa} className={ui.input} style={{ minWidth: 90 }} aria-label="عنوان" />
                            <input name={`value_${k}`} defaultValue={r.suggestion.valueFa} className={ui.input} style={{ minWidth: 120 }} aria-label="مقدار" />
                            <input name={`unit_${k}`} defaultValue={r.suggestion.unit} className={ui.input} style={{ width: 80 }} aria-label="واحد" />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ActionForm>
        </div>
      )}

      <div id="media" className={styles.card} style={{ marginTop: 16, scrollMarginTop: 16 }}>
        <h2 className={styles.cardTitle}>عکس و ویدیو ({fmtNum(media.length)})</h2>
        {justCreated && (
          <p className={styles.notice} role="status">
            ✓ محصول ساخته شد. حالا عکس و ویدیوی آن را اینجا آپلود کنید یا از لینک وارد کنید.
          </p>
        )}
        <p className={styles.muted} style={{ marginTop: 0 }}>
          عکس اول «عکس اصلی» است (کارت محصول و اول گالری). «منتشر نشود» برای عکسی است که لوگو یا اسم کارخانه دارد: در پنل می‌ماند ولی هرگز در سایت نمایش داده نمی‌شود.
        </p>
        <MediaModeNote ready={uploads} />
        {uploads && <ProductMediaUploader productId={p.id} batchMax={limits.batchMax} imageMaxMb={limits.imageMaxMb} videoMaxMb={videoMaxMb} />}
        {uploads && (
          <details className={styles.detailsBox} style={{ marginTop: 10 }}>
            <summary>+ وارد کردن عکس از لینک (مثلاً علی‌بابا)</summary>
            <ProductUrlImporter productId={p.id} batchMax={limits.batchMax} listings={listings.map((l, i) => ({ id: l.id, label: companyLabel(l, i) }))} />
          </details>
        )}
        {media.some((m) => m.kind === "image") && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }} data-testid="media-bulk">
            {(
              [
                ["all", "همه‌ی عکس‌ها عمومی"],
                ["none", "هیچ‌کدام عمومی"],
              ] as const
            ).map(([cmd, label]) => (
              <form key={cmd} action={mediaBulkAction}>
                <input type="hidden" name="productId" value={p.id} />
                <input type="hidden" name="cmd" value={cmd} />
                <button type="submit" className={styles.btnGhost}>
                  {label}
                </button>
              </form>
            ))}
          </div>
        )}
        <div className={styles.mediaGrid} style={{ marginTop: 12 }}>
          {media.map((m, i) => (
            <div key={m.id} className={styles.mediaItem}>
              {m.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(m.storageKey, "sm") ?? ""} alt={m.altFa ?? ""} loading="lazy" referrerPolicy="no-referrer" />
              ) : m.posterKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(m.posterKey, "sm") ?? ""} alt="پیش‌نمایش ویدیو" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <div className={styles.mediaVideo}>🎬 ویدیو</div>
              )}
              <div className={styles.mediaMeta}>
                {i === 0 && <span className={styles.badge}>عکس اصلی</span>}
                {m.kind === "video" && <span className={styles.badge}>ویدیو</span>}
                {m.listingId && listingIndex.has(m.listingId) && (
                  <span className={styles.badge} data-testid="media-listing">
                    از لیستینگ: {companyLabel(listings[listingIndex.get(m.listingId)!], listingIndex.get(m.listingId)!)}
                  </span>
                )}
                {m.storageKey.startsWith(DB_MEDIA_PREFIX) && <span className={styles.badge}>از علی‌بابا (دیتابیس)</span>}
                {imported.has(m.storageKey) && (
                  <a
                    className={styles.badge}
                    href={imported.get(m.storageKey)?.sourceUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={imported.get(m.storageKey)?.sourceUrl ?? ""}
                  >
                    {imported.get(m.storageKey)?.source === "extension" ? "از اکستنشن" : "از لینک"}
                  </a>
                )}
                {m.isPublic ? (
                  <span className={styles.badge}>در سایت</span>
                ) : (
                  <span className={`${styles.badge} ${styles.badgeWarn}`}>
                    {imported.has(m.storageKey) || m.storageKey.startsWith(DB_MEDIA_PREFIX) ? "منتشر نشود (بررسی کنید)" : "منتشر نشود (لوگو)"}
                  </span>
                )}
                <div className={`${styles.ltr} ${styles.muted}`} style={{ fontSize: 11, overflowWrap: "anywhere" }}>
                  {m.storageKey}
                </div>
              </div>
              <div className={styles.mediaActions}>
                {(
                  [
                    ["main", "عکس اصلی"],
                    ["toggle", m.isPublic ? "منتشر نشود" : "انتشار"],
                    ["up", "↑"],
                    ["down", "↓"],
                    ["delete", "حذف"],
                  ] as const
                )
                  // «عکس اصلی» فقط برای عکسی که الان اول نیست
                  .filter(([cmd]) => cmd !== "main" || (i > 0 && m.kind === "image"))
                  .map(([cmd, label]) => (
                    <form key={cmd} action={mediaCommandAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="cmd" value={cmd} />
                      <button type="submit" className={styles.btnGhost} disabled={(cmd === "up" && i === 0) || (cmd === "down" && i === media.length - 1)}>
                        {label}
                      </button>
                    </form>
                  ))}
              </div>
              {m.kind === "video" && (
                <details>
                  <summary style={{ fontSize: 12, cursor: "pointer" }}>عکس پیش‌نمایش</summary>
                  <ActionForm action={setPosterAction} submitLabel="ذخیره" submitVariant="secondary">
                    <input type="hidden" name="id" value={m.id} />
                    <UploadImageField
                      name="poster"
                      label="عکس پیش‌نمایش"
                      purpose="poster"
                      defaultValue={m.posterKey ?? ""}
                      previewUrl={mediaUrl(m.posterKey, "sm")}
                      uploadEnabled={uploads}
                    />
                  </ActionForm>
                </details>
              )}
            </div>
          ))}
        </div>
        <details className={styles.detailsBox} style={{ marginTop: 12 }}>
          <summary>+ افزودن با آدرس (لینک مستقیم فایل)</summary>
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
        <div className={styles.notice} data-testid="ref-summary" style={{ marginTop: 0 }}>
          {ref.price ? (
            <>
              <strong>
                قیمت سایت برای {fmtNum(ref.price.qty)} {unitFa(p.priceUnit)}
              </strong>{" "}
              ({ref.price.qtySource === "manual" ? "تعداد مرجع دستی" : "پیش‌فرض: میانه‌ی حداقل سفارش لیستینگ‌ها"}
              {ref.manual && ref.price.qty !== ref.manual ? `؛ ${fmtNum(ref.manual)} کمتر از کوچک‌ترین حداقل سفارش بود` : ""}): میانگین{" "}
              <strong className={styles.ltr}>${fmtUsd(ref.price.avg)}</strong> از {fmtNum(ref.price.suppliers)} کارخانه | بازه ${fmtUsd(ref.price.min)} تا ${fmtUsd(ref.price.max)}
              {ref.price.excluded.length > 0 && ` | ${fmtNum(ref.price.excluded.length)} لیستینگ با حداقل سفارش بیشتر حساب نشد`}
            </>
          ) : (
            "هنوز قیمتی برای میانگین سایت نیست."
          )}
          <div style={{ fontSize: 12, marginTop: 4 }}>
            روش: از هر لیستینگ فعالِ کارخانه‌ی فعال، آخرین نوبت قیمت؛ پله‌ای که تعداد مرجع در آن می‌افتد (وسط بازه‌ی همان پله)؛ هر کارخانه یک رأی؛ میانگین رأی‌ها. لیستینگی که حداقل
            سفارشش از تعداد مرجع بیشتر است کنار گذاشته می‌شود. یوان با نسبت نرخ روز یوان به دلار تبدیل می‌شود. هیچ عددی گرد نمی‌شود مگر در نمایش.{" "}
            <Link href={`/admin/rates/calculator?product=${p.id}`}>ماشین‌حساب قیمت تمام‌شده</Link>
          </div>
        </div>
        <ActionForm action={setReferenceQtyAction} submitLabel="ذخیره‌ی تعداد مرجع" submitVariant="secondary">
          <input type="hidden" name="id" value={p.id} />
          <Field
            label="تعداد مرجع قیمت سایت"
            name="referenceQty"
            defaultValue={ref.manual ? String(ref.manual) : ""}
            ltr
            inputMode="numeric"
            hint={`خالی = پیش‌فرض (${ref.defaultQty ? fmtNum(ref.defaultQty) : "—"}). کارت «قیمت تمام‌شده»ی سایت هم با همین تعداد باز می‌شود.`}
          />
        </ActionForm>
        {listings.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>کارخانه</th>
                  {seeCompanies && <th>نوع و سابقه</th>}
                  <th>آخرین قیمت</th>
                  <th>در میانگین سایت</th>
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
                  const ali = ((l.companyMeta as { alibaba?: { yearsOnAlibaba?: number | null; foundedYear?: number | null } } | null)?.alibaba ?? {}) as {
                    yearsOnAlibaba?: number | null;
                    foundedYear?: number | null;
                  };
                  const used = usedOf.get(l.id);
                  const excl = excludedOf.get(l.id);
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
                        {seeLinks && (profiles.get(l.companyId) || l.externalUrl) && (
                          <div style={{ fontSize: 12 }}>
                            {profiles.get(l.companyId) && (
                              <a href={profiles.get(l.companyId)!} target="_blank" rel="noreferrer noopener" data-testid="supplier-profile-link">
                                پروفایل در علی‌بابا ↗
                              </a>
                            )}
                            {profiles.get(l.companyId) && l.externalUrl && " | "}
                            {l.externalUrl && (
                              <a href={l.externalUrl} target="_blank" rel="noreferrer noopener" data-testid="listing-product-link">
                                صفحه‌ی محصول ↗
                              </a>
                            )}
                          </div>
                        )}
                        <div>
                          {l.status !== "active" && <span className={`${styles.badge} ${styles.badgeWarn}`}>لیستینگ {LISTING_STATUS_FA[l.status]}</span>}
                          {l.companyStatus !== "active" && <span className={`${styles.badge} ${styles.badgeWarn}`}>کارخانه {COMPANY_STATUS_FA[l.companyStatus]}</span>}
                        </div>
                      </td>
                      {seeCompanies && (
                        <td style={{ fontSize: 13 }}>
                          {COMPANY_TYPE_FA[l.companyType]}
                          {ali.yearsOnAlibaba != null && <div>سابقه در علی‌بابا: {fmtNum(ali.yearsOnAlibaba)} سال</div>}
                          {ali.foundedYear != null && <div>سال تأسیس: {ali.foundedYear}</div>}
                        </td>
                      )}
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
                              {b.currency === "CNY" && " · با نرخ روز به دلار تبدیل می‌شود"}
                            </div>
                          </div>
                        ))}
                        {!batches.length && <span className={styles.muted}>قیمت ثبت نشده</span>}
                      </td>
                      <td data-testid="in-average">
                        {used ? (
                          <>
                            <strong className={styles.ltr}>${fmtUsd(used.price)}</strong>
                            <div className={styles.muted} style={{ fontSize: 12 }}>
                              پله‌ی {qtyRange(used.tier)}
                            </div>
                          </>
                        ) : excl ? (
                          <span className={`${styles.badge} ${styles.badgeWarn}`}>حساب نشد: حداقل سفارش {fmtNum(excl.moq)}</span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
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
              {(await can(a.user, "companies.links")) && <Field label="لینک محصول در علی‌بابا" name="externalUrl" ltr maxLength={1000} hint="https://…" />}
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
