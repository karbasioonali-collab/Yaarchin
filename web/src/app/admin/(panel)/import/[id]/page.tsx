import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import { RowsEditor } from "@/components/ui/RowsEditor";
import ui from "@/components/ui/ui.module.css";
import { db } from "@/db/client";
import { companies, rawPageEdits, rawPageImages, rawPages, users } from "@/db/schema";
import { can, requirePermission } from "@/lib/auth/can";
import { adminCategoryTree, categoryLabel } from "@/lib/catalog/admin-tree";
import { importEditsReady, importReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum, UNITS, unitFa } from "@/lib/format";
import { type AlibabaPage, type FieldStatus, PARSER_VERSION } from "@/lib/import/alibaba/parse";
import { type Edits, effective } from "@/lib/import/edits";
import { slugify, suggestCategory, suggestProducts } from "@/lib/import/register";
import { duplicatesOf, RAW_STATUS_FA } from "@/lib/import/service";
import styles from "../../panel.module.css";
import { registerAction, rejectAction, reparseAction, restoreAction, reviewedAction, saveEditsAction } from "../actions";
import { AllPublicButton } from "../AllPublicButton";
import { OpenOnce } from "../OpenOnce";

export const metadata: Metadata = { title: "بررسی صفحه‌ی علی‌بابا" };

const FIELD_FA: Record<string, string> = {
  productUrl: "لینک محصول",
  title: "اسم",
  price: "قیمت",
  moq: "حداقل سفارش",
  attributes: "مشخصات",
  options: "رنگ و مدل",
  customization: "سفارشی‌سازی",
  leadTime: "زمان آماده‌سازی",
  unitWeight: "وزن تکی",
  unitDims: "ابعاد تکی",
  unitsPerCarton: "تعداد در کارتن",
  cartonWeight: "وزن کارتن",
  cartonDims: "ابعاد کارتن",
  images: "عکس‌های اصلی",
  descriptionImages: "عکس‌های توضیحات",
  highlights: "Highlights",
  supplierName: "اسم فروشنده",
  supplierType: "نوع فروشنده",
  supplierYears: "سابقه",
  supplierCountry: "کشور",
  supplierProfileUrl: "لینک پروفایل فروشنده",
};
const STATUS_BADGE: Record<FieldStatus, [string, string]> = { found: ["خوانده شد", ""], estimated: ["تخمینی", "badgeWarn"], missing: ["پیدا نشد", "badgeMuted"] };
const TYPE_FA: Record<string, string> = { trading: "بازرگانی", manufacturer: "تولیدی", other: "دیگر" };
// جداکننده‌ی کنار عددها: « | » (نقطه‌ی میانی «·» کنار رقم فارسی شبیه صفر دیده می‌شد؛ بخش ۳۷)
const SEP = " | ";
const dims = (d: { l: number; w: number; h: number } | null) => (d ? `${fmtNum(d.l)}×${fmtNum(d.w)}×${fmtNum(d.h)} سانتی‌متر` : "—");
const s2 = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

// صفحه‌ی بررسی، اصلاح و ثبت (بخش ۳۶ و ۳۷)
export default async function ImportReviewPage({ params }: PageProps<"/admin/import/[id]">) {
  const a = await requirePermission("catalog.import");
  const { id } = await params;
  if (!(await importReady()) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [page] = await db
    .select({
      id: rawPages.id,
      platform: rawPages.platform,
      externalProductId: rawPages.externalProductId,
      storeId: rawPages.storeId,
      status: rawPages.status,
      rejectReason: rawPages.rejectReason,
      parsed: rawPages.parsed,
      parserVersion: rawPages.parserVersion,
      fileName: rawPages.fileName,
      fileBytes: rawPages.fileBytes,
      createdAt: rawPages.createdAt,
      productId: rawPages.productId,
      listingId: rawPages.listingId,
      uploader: users.fullName,
    })
    .from(rawPages)
    .leftJoin(users, eq(users.id, rawPages.uploadedBy))
    .where(eq(rawPages.id, id));
  if (!page) notFound();
  const p = page.parsed as AlibabaPage;
  const editsOn = await importEditsReady();
  const [images, dup, seeSupplier, seeLinks, editRow] = await Promise.all([
    db
      .select({ id: rawPageImages.id, url: rawPageImages.url, size: rawPageImages.size })
      .from(rawPageImages)
      .where(eq(rawPageImages.rawPageId, id))
      .orderBy(asc(rawPageImages.position)),
    duplicatesOf(page),
    can(a.user, "companies.view"),
    can(a.user, "companies.links"),
    editsOn ? db.select({ data: rawPageEdits.data, at: rawPageEdits.updatedAt }).from(rawPageEdits).where(eq(rawPageEdits.rawPageId, id)) : Promise.resolve([]),
  ]);
  const edits = (editRow[0]?.data ?? {}) as Edits;
  const v = effective(p, edits);
  const edited = new Set<string>(v.edited);
  const canEdit = editsOn && page.status !== "imported";
  const canRegister = editsOn && (page.status === "new" || page.status === "reviewed");
  const sym = v.currency === "CNY" ? "¥" : "$";
  const unit = unitFa(v.unit);
  const range = (min: number, max: number | null) => (max ? `${fmtNum(min)} تا ${fmtNum(max)}` : `${fmtNum(min)} و بیشتر`);
  const s = p.supplier;
  const pk = v.packing;
  // مقداری که خواننده از مشخصات صفحه برداشته و هنوز اصلاح نشده (بخش ۴۱)
  const fromSpecs = (k: "unitWeightKg" | "unitDimsCm" | "unitsPerCarton"): string | undefined => (p.packing[k] !== null && !edited.has(k) ? "از مشخصات" : undefined);
  const mark = (k: string) => (edited.has(k) ? <span className={`${styles.badge} ${styles.badgeWarn}`}>اصلاح‌شده</span> : null);

  // داده‌های فرم ثبت
  const [perms, tree, suggestedCat] = canRegister
    ? await Promise.all([
        Promise.all(["companies.view", "companies.manage", "products.manage", "categories.manage"].map((k) => can(a.user, k))),
        adminCategoryTree(),
        suggestCategory(p),
      ])
    : [[false, false, false, false], [], null];
  const [canCompanies, canCompaniesManage, canProducts, canCategories] = perms;
  const suggested = canRegister ? await suggestProducts(p, suggestedCat) : [];
  const companyList =
    canRegister && canCompanies && !dup.company ? await db.select({ id: companies.id, name: companies.nameEn }).from(companies).orderBy(asc(companies.nameEn)).limit(300) : [];
  const registerBlock = !canCompanies ? "دسترسی «دیدن کارخانه‌ها» لازم است." : !canProducts ? "دسترسی «مدیریت محصولات» لازم است." : null;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle} dir="auto">
            {v.title ?? "(بدون عنوان)"}
          </h1>
          <p className={styles.pageSub}>
            <Link href="/admin/import">ورود از علی‌بابا</Link>
            {SEP}
            {RAW_STATUS_FA[page.status]}
            {SEP}آپلود {fmtDateTime(page.createdAt)} ({page.uploader ?? "—"}){SEP}
            {page.fileName ?? "فایل"} ({fmtNum(Math.round(page.fileBytes / 1024))} کیلوبایت)
            {seeLinks && p.productUrl && (
              <>
                {SEP}
                <a href={p.productUrl} target="_blank" rel="noreferrer noopener">
                  صفحه‌ی محصول در علی‌بابا ↗
                </a>
              </>
            )}
            {page.productId && page.listingId && (
              <>
                {SEP}
                <Link href={`/admin/products/${page.productId}/listings/${page.listingId}`}>لیستینگ ثبت‌شده</Link>
              </>
            )}
          </p>
        </div>
      </div>

      {(dup.samePage.length > 0 || dup.listing || dup.company || dup.sameStore.length > 0) && (
        <div className={styles.rateWarn} role="status" data-testid="duplicates">
          <span>
            {dup.listing && (
              <>
                این محصول قبلاً به لیستینگی وصل شده
                {dup.listing.productId && (
                  <>
                    {" "}
                    (<Link href={`/admin/products/${dup.listing.productId}/listings/${dup.listing.listingId}`}>{dup.listing.productTitle ?? "محصول"}</Link>)
                  </>
                )}
                ؛ با ثبت، همان لیستینگ به‌روز می‌شود.{" "}
              </>
            )}
            {dup.samePage.length > 0 && (
              <>
                همین محصول {fmtNum(dup.samePage.length)} بار دیگر آپلود شده:{" "}
                {dup.samePage.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && "، "}
                    <Link href={`/admin/import/${d.id}`}>
                      {fmtDateTime(d.createdAt)} ({RAW_STATUS_FA[d.status]})
                    </Link>
                  </span>
                ))}
                .{" "}
              </>
            )}
            {dup.company && (
              <>
                فروشنده قبلاً ثبت شده
                {seeSupplier ? (
                  <>
                    : <Link href={`/admin/companies/${dup.company.id}`}>{dup.company.name}</Link>
                  </>
                ) : (
                  ""
                )}
                .{" "}
              </>
            )}
            {!dup.company && dup.sameStore.length > 0 && (
              <>
                همین فروشنده در {fmtNum(dup.sameStore.length)} صفحه‌ی آپلودشده‌ی دیگر هم هست:{" "}
                {dup.sameStore.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && "، "}
                    <Link href={`/admin/import/${d.id}`} dir="auto">
                      {d.title ?? "صفحه"}
                    </Link>{" "}
                    ({RAW_STATUS_FA[d.status]})
                  </span>
                ))}
                .
              </>
            )}
          </span>
        </div>
      )}
      {p.warnings.length > 0 && (
        <div className={styles.card} style={{ marginBottom: 16 }}>
          <h2 className={styles.cardTitle}>هشدارها</h2>
          <ul style={{ margin: 0, paddingInlineStart: 20, fontSize: 14 }} data-testid="warnings">
            {p.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>وضعیت فیلدها</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} data-testid="fields">
            {Object.entries(p.fields).map(([k, st]) => (
              <span key={k} className={`${styles.badge} ${STATUS_BADGE[st][1] ? styles[STATUS_BADGE[st][1]] : ""}`}>
                {FIELD_FA[k] ?? k}: {STATUS_BADGE[st][0]}
              </span>
            ))}
          </div>
          <p className={styles.muted} style={{ fontSize: 12, marginBottom: 0 }}>
            خوانده‌شده با خواننده‌ی نسخه‌ی {fmtNum(page.parserVersion)}
            {page.parserVersion < PARSER_VERSION ? ` (نسخه‌ی فعلی ${fmtNum(PARSER_VERSION)}؛ «خواندن دوباره» را بزنید)` : ""}
            {v.edited.length > 0 && (
              <>
                {" "}
                {SEP}اصلاح‌شده: {fmtNum(v.edited.length)} فیلد (اصلاح‌ها با «خواندن دوباره» می‌مانند)
              </>
            )}
            .
          </p>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>کارها</h2>
          {page.status === "rejected" && page.rejectReason && <p style={{ marginTop: 0 }}>دلیل رد: {page.rejectReason}</p>}
          <div className={styles.inlineForm}>
            {page.status === "new" && (
              <form action={reviewedAction}>
                <input type="hidden" name="id" value={page.id} />
                <button type="submit" className={styles.btnGhost}>
                  بررسی شد
                </button>
              </form>
            )}
            {page.status === "rejected" && (
              <form action={restoreAction}>
                <input type="hidden" name="id" value={page.id} />
                <button type="submit" className={styles.btnGhost}>
                  بازگرداندن
                </button>
              </form>
            )}
            <form action={reparseAction}>
              <input type="hidden" name="id" value={page.id} />
              <button type="submit" className={styles.btnGhost}>
                خواندن دوباره
              </button>
            </form>
          </div>
          {page.status !== "rejected" && page.status !== "imported" && (
            <details className={styles.detailsBox} style={{ marginTop: 12 }}>
              <summary>رد کردن</summary>
              <ActionForm action={rejectAction} submitLabel="رد کن" submitVariant="danger">
                <input type="hidden" name="id" value={page.id} />
                <label className={ui.field}>
                  <span className={ui.label}>دلیل (اختیاری)</span>
                  <input name="reason" maxLength={500} className={ui.input} />
                </label>
                <span className={ui.hint}>عکس‌های این صفحه از دیتابیس پاک می‌شوند؛ متن صفحه برای بازگرداندن می‌ماند.</span>
              </ActionForm>
            </details>
          )}
          {!editsOn && <p className={styles.muted}>اصلاح و ثبت بعد از اجرای migration ۰۰۱۳ فعال می‌شوند.</p>}
        </div>
      </div>

      <div className={styles.grid} style={{ marginTop: 16 }}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>قیمت و سفارش {mark("priceTiers")}</h2>
          {v.priceTiers.length ? (
            <table className={styles.table} data-testid="price-tiers">
              <thead>
                <tr>
                  <th>تعداد ({unit})</th>
                  <th>قیمت واحد</th>
                </tr>
              </thead>
              <tbody>
                {v.priceTiers.map((t, i) => (
                  <tr key={i}>
                    <td>{range(t.minQty, t.maxQty)}</td>
                    <td className={styles.ltr}>
                      {sym}
                      {t.price}
                      {t.priceMax ? ` – ${sym}${t.priceMax}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>قیمتی خوانده نشد.</p>
          )}
          <p style={{ fontSize: 14 }}>
            حداقل سفارش: {v.moq ? `${fmtNum(v.moq)} ${unit}` : "—"} {mark("moq")}
            {p.customization.length > 0 && (
              <>
                {SEP}سفارشی‌سازی: {p.customization.map((c) => `${c.name}${c.moq ? ` (حداقل ${fmtNum(c.moq)})` : ""}`).join("، ")}
              </>
            )}
            {p.options.length > 0 && (
              <>
                {SEP}
                {p.options.map((o) => `${o.name}: ${o.values.join("، ")}${o.customizable ? " (سفارشی‌پذیر)" : ""}`).join(SEP)}
              </>
            )}
          </p>
          <h3 className={styles.groupTitle}>زمان آماده‌سازی {mark("leadTimes")}</h3>
          {v.leadTimes.length ? (
            <table className={styles.table}>
              <tbody>
                {v.leadTimes.map((t, i) => (
                  <tr key={i}>
                    <td>{range(t.minQty, t.maxQty)}</td>
                    <td>{fmtNum(t.days)} روز</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>—</p>
          )}
          <h3 className={styles.groupTitle}>بسته‌بندی و HS</h3>
          <p style={{ fontSize: 14, margin: 0 }} data-testid="packing">
            وزن تکی: {pk.unitWeightKg !== null ? `${fmtNum(pk.unitWeightKg)} کیلوگرم` : "—"} {mark("unitWeightKg")}
            {SEP}ابعاد تکی: {dims(pk.unitDimsCm)} {mark("unitDimsCm")}
            {SEP}تعداد در کارتن: {pk.unitsPerCarton ? fmtNum(pk.unitsPerCarton) : "—"} {mark("unitsPerCarton")}
            {v.packQty && (
              <>
                {SEP}در هر بسته: {fmtNum(v.packQty)}
              </>
            )}
            <br />
            وزن کارتن: {pk.cartonWeightKg !== null ? `${fmtNum(pk.cartonWeightKg)} کیلوگرم` : "—"}
            {pk.estimated.cartonWeightKg && <span className={`${styles.badge} ${styles.badgeWarn}`}>تخمینی</span>} {mark("cartonWeightKg")}
            {SEP}ابعاد کارتن: {dims(pk.cartonDimsCm)}
            {pk.estimated.cartonDimsCm && <span className={`${styles.badge} ${styles.badgeWarn}`}>تخمینی</span>} {mark("cartonDimsCm")}
            {SEP}HS: <span className={styles.ltr}>{v.hsCode ?? "—"}</span>
          </p>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>فروشنده</h2>
          {seeSupplier ? (
            <>
              <p style={{ marginTop: 0, fontWeight: 600 }} dir="auto">
                {seeLinks && s.profileUrl ? (
                  <a href={s.profileUrl} target="_blank" rel="noreferrer noopener">
                    {s.name ?? "—"} ↗
                  </a>
                ) : (
                  (s.name ?? "—")
                )}
              </p>
              <p style={{ fontSize: 14 }} data-testid="supplier-line">
                {TYPE_FA[s.type ?? ""] ?? "—"}
                {SEP}
                {s.country ?? "—"}
                {SEP}سابقه در علی‌بابا: {s.years !== null ? `${fmtNum(s.years)} سال` : "نامعلوم"}
                {s.yearsText && (
                  <span className={styles.muted} dir="ltr">
                    {" "}
                    ({s.yearsText})
                  </span>
                )}
                {s.foundedYear && (
                  <>
                    {SEP}سال تأسیس (از متن فروشنده): {s.foundedYear}
                  </>
                )}
                {s.rating !== null && (
                  <>
                    {SEP}امتیاز {fmtNum(s.rating)}
                  </>
                )}
              </p>
              <p className={styles.muted} style={{ fontSize: 13 }}>
                درآمد: <span className={styles.ltr}>{s.revenue ?? "—"}</span>
                {SEP}پاسخ: <span className={styles.ltr}>{s.responseTime ?? "—"}</span>
                {SEP}ارسال به‌موقع: <span className={styles.ltr}>{s.onTimeRate ?? "—"}</span>
                {s.storeId && (
                  <>
                    {SEP}شناسه‌ی فروشگاه: <span className={styles.ltr}>{s.storeId}</span>
                  </>
                )}
              </p>
            </>
          ) : (
            <p className={styles.muted}>اطلاعات فروشنده فقط با دسترسی «دیدن کارخانه‌ها».</p>
          )}
          <h3 className={styles.groupTitle}>محل تولید و دسته در علی‌بابا</h3>
          <p style={{ fontSize: 14, margin: 0 }}>
            {p.placeOfOrigin ?? "—"}
            {SEP}
            <span dir="ltr">{p.categoryPath.join(" › ") || "—"}</span>
          </p>
        </div>
      </div>

      {canEdit && (
        <OpenOnce className={styles.detailsBox} style={{ marginTop: 16 }} initialOpen={v.ambiguousQty !== null && !edits.qtyChoice}>
          <summary>اصلاح مقدارها</summary>
          <ActionForm action={saveEditsAction} submitLabel="ذخیره‌ی اصلاح‌ها">
            <input type="hidden" name="id" value={page.id} />
            {v.ambiguousQty && (
              <fieldset className={styles.card} data-testid="qty-choice" style={{ margin: 0 }}>
                <legend style={{ fontWeight: 600 }}>
                  مشخصات صفحه «Quantity: <span dir="ltr">{v.ambiguousQty.text}</span>» دارد. یعنی چه؟
                </legend>
                <input type="hidden" name="qtyValue" value={v.ambiguousQty.value} />
                <label style={{ display: "block" }}>
                  <input type="radio" name="qty" value="" defaultChecked={!edits.qtyChoice} /> هنوز نمی‌دانم
                </label>
                <label style={{ display: "block" }}>
                  <input type="radio" name="qty" value="pack" defaultChecked={edits.qtyChoice?.kind === "pack"} /> {fmtNum(v.ambiguousQty.value)} عدد در هر بسته
                </label>
                <label style={{ display: "block" }}>
                  <input type="radio" name="qty" value="carton" defaultChecked={edits.qtyChoice?.kind === "carton"} /> {fmtNum(v.ambiguousQty.value)} عدد در هر کارتن
                </label>
                <label style={{ display: "block" }}>
                  <input type="radio" name="qty" value="other" defaultChecked={edits.qtyChoice?.kind === "other"} /> مقدار دیگر (تعداد در کارتن):{" "}
                  <input
                    name="qtyOther"
                    inputMode="numeric"
                    dir="ltr"
                    style={{ width: 100 }}
                    defaultValue={edits.qtyChoice?.kind === "other" ? String(edits.qtyChoice.value) : ""}
                  />
                </label>
                <span className={ui.hint}>«در هر کارتن» و «مقدار دیگر» در تخمین وزن و ابعاد کارتن و ماشین‌حساب قیمت تمام‌شده استفاده می‌شوند.</span>
              </fieldset>
            )}
            <Field label="اسم انگلیسی" name="title" defaultValue={v.title ?? ""} ltr maxLength={300} />
            <div className={styles.row}>
              <label className={ui.field}>
                <span className={ui.label}>واحد</span>
                <select name="unit" defaultValue={UNITS[v.unit] ? v.unit : "piece"} className={ui.select}>
                  {Object.entries(UNITS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="حداقل سفارش" name="moq" defaultValue={s2(v.moq)} ltr inputMode="numeric" />
              <label className={ui.field}>
                <span className={ui.label}>ارز</span>
                <select name="currency" defaultValue={v.currency ?? ""} className={ui.select}>
                  <option value="">—</option>
                  <option value="USD">دلار (USD)</option>
                  <option value="CNY">یوان (CNY)</option>
                </select>
              </label>
            </div>
            <span className={ui.label}>پله‌های قیمت (قیمت واحد)</span>
            <RowsEditor
              columns={[
                { name: "tierMin", label: "از تعداد", ltr: true, inputMode: "numeric" },
                { name: "tierMax", label: "تا تعداد (خالی = بیشتر)", ltr: true, inputMode: "numeric" },
                { name: "tierPrice", label: "قیمت", ltr: true, inputMode: "decimal" },
                { name: "tierPriceMax", label: "تا قیمت (اختیاری)", ltr: true, inputMode: "decimal" },
              ]}
              initial={v.priceTiers.map((t) => ({ tierMin: s2(t.minQty), tierMax: s2(t.maxQty), tierPrice: s2(t.price), tierPriceMax: s2(t.priceMax) }))}
            />
            <span className={ui.label}>پله‌های زمان آماده‌سازی</span>
            <RowsEditor
              columns={[
                { name: "ltMin", label: "از تعداد", ltr: true, inputMode: "numeric" },
                { name: "ltMax", label: "تا تعداد (خالی = بیشتر)", ltr: true, inputMode: "numeric" },
                { name: "ltDays", label: "روز", ltr: true, inputMode: "numeric" },
              ]}
              initial={v.leadTimes.map((t) => ({ ltMin: s2(t.minQty), ltMax: s2(t.maxQty), ltDays: s2(t.days) }))}
            />
            <div className={styles.row}>
              <Field label="وزن تکی (کیلوگرم)" name="unitWeightKg" defaultValue={s2(pk.unitWeightKg)} ltr inputMode="decimal" hint={fromSpecs("unitWeightKg")} />
              <Field label="طول تکی (سانتی‌متر)" name="unitL" defaultValue={s2(pk.unitDimsCm?.l)} ltr inputMode="decimal" hint={fromSpecs("unitDimsCm")} />
              <Field label="عرض تکی" name="unitW" defaultValue={s2(pk.unitDimsCm?.w)} ltr inputMode="decimal" />
              <Field label="ارتفاع تکی" name="unitH" defaultValue={s2(pk.unitDimsCm?.h)} ltr inputMode="decimal" />
            </div>
            <div className={styles.row}>
              <Field
                label="تعداد در کارتن"
                name="unitsPerCarton"
                defaultValue={edited.has("unitsPerCarton") ? s2(pk.unitsPerCarton) : s2(p.packing.unitsPerCarton)}
                ltr
                inputMode="numeric"
                hint={fromSpecs("unitsPerCarton") ?? "خالی = از انتخاب «Quantity» بالا"}
              />
              <Field
                label="وزن کارتن (کیلوگرم)"
                name="cartonWeightKg"
                defaultValue={pk.estimated.cartonWeightKg ? "" : s2(pk.cartonWeightKg)}
                ltr
                inputMode="decimal"
                hint={pk.estimated.cartonWeightKg ? `تخمین فعلی: ${fmtNum(pk.cartonWeightKg ?? 0)}` : undefined}
              />
            </div>
            <div className={styles.row}>
              <Field label="طول کارتن (سانتی‌متر)" name="cartonL" defaultValue={pk.estimated.cartonDimsCm ? "" : s2(pk.cartonDimsCm?.l)} ltr inputMode="decimal" />
              <Field label="عرض کارتن" name="cartonW" defaultValue={pk.estimated.cartonDimsCm ? "" : s2(pk.cartonDimsCm?.w)} ltr inputMode="decimal" />
              <Field
                label="ارتفاع کارتن"
                name="cartonH"
                defaultValue={pk.estimated.cartonDimsCm ? "" : s2(pk.cartonDimsCm?.h)}
                ltr
                inputMode="decimal"
                hint={pk.estimated.cartonDimsCm ? `تخمین فعلی: ${dims(pk.cartonDimsCm)}` : "خالی = تخمین از تکی × تعداد"}
              />
            </div>
            <Field label="HS code" name="hsCode" defaultValue={v.hsCode ?? ""} ltr maxLength={30} hint="باید در «نرخ‌ها و هزینه‌ها ← HS code» باشد؛ موقع ثبت بررسی می‌شود." />
            {edited.size > 0 && (
              <p className={styles.muted} style={{ fontSize: 12, margin: 0 }}>
                مقدار خوانده‌شده‌ی فیلدهای اصلاح‌شده: {[...edited].map((k) => `${k}`).join("، ")}. برای برگرداندن، همان مقدار صفحه را دوباره بنویسید.
              </p>
            )}
          </ActionForm>
        </OpenOnce>
      )}

      <div className={styles.card} style={{ marginTop: 16 }}>
        <h2 className={styles.cardTitle}>
          عکس‌های اصلی ({fmtNum(images.length)} در دیتابیس از {fmtNum(p.galleryCount)})
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} data-testid="images">
          {images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.id}
              src={`/api/admin/import/image/${img.id}`}
              alt=""
              width={140}
              height={140}
              style={{ objectFit: "contain", background: "#f4f4f4", borderRadius: 8 }}
              loading="lazy"
            />
          ))}
        </div>
        {!images.length && <p className={styles.muted}>{page.status === "rejected" ? "عکس‌های صفحه‌ی ردشده پاک شده‌اند." : "عکسی ذخیره نشد."}</p>}
        <p className={styles.muted} style={{ fontSize: 12, marginBottom: 0 }}>
          عکس‌های توضیحات ({fmtNum(p.descriptionImages.length)}) فقط لینک‌اند و ذخیره نمی‌شوند. انتخاب عکس‌ها برای محصول و «عمومی» بودنشان در بخش ثبت.
        </p>
      </div>

      {canRegister && (
        <div className={styles.card} style={{ marginTop: 16 }} data-testid="register">
          <h2 className={styles.cardTitle}>ثبت فروشنده، لیستینگ، قیمت‌ها و عکس‌ها</h2>
          {registerBlock ? (
            <p className={styles.notice}>{registerBlock}</p>
          ) : (
            <ActionForm action={registerAction} submitLabel="ثبت">
              <input type="hidden" name="id" value={page.id} />
              <h3 className={styles.groupTitle}>۱. فروشنده</h3>
              {dup.company ? (
                <>
                  <input type="hidden" name="companyMode" value="existing" />
                  <input type="hidden" name="companyId" value={dup.company.id} />
                  <p style={{ margin: 0 }}>
                    فروشنده‌ی ثبت‌شده: <Link href={`/admin/companies/${dup.company.id}`}>{dup.company.name}</Link> (از روی شناسه‌ی فروشگاه)
                  </p>
                </>
              ) : (
                <>
                  <label style={{ display: "block" }}>
                    <input type="radio" name="companyMode" value="new" defaultChecked disabled={!canCompaniesManage} /> فروشنده‌ی تازه
                    {!canCompaniesManage && <span className={styles.muted}> (دسترسی «ثبت و ویرایش کارخانه‌ها» لازم است)</span>}
                  </label>
                  <div className={styles.row}>
                    <Field label="اسم فروشنده (انگلیسی)" name="companyName" defaultValue={s.name ?? ""} ltr maxLength={300} />
                    <label className={ui.field}>
                      <span className={ui.label}>نوع (فقط ثبت)</span>
                      <select name="companyType" defaultValue={s.type === "manufacturer" ? "manufacturer" : s.type === "trading" ? "trading" : "unknown"} className={ui.select}>
                        <option value="trading">بازرگانی</option>
                        <option value="manufacturer">تولیدی</option>
                        <option value="unknown">نامعلوم</option>
                      </select>
                    </label>
                  </div>
                  <label style={{ display: "block" }}>
                    <input type="radio" name="companyMode" value="existing" defaultChecked={!canCompaniesManage} /> فروشنده‌ی موجود:{" "}
                    <select name="companyId" defaultValue="" className={ui.select} style={{ display: "inline-block", width: "auto", maxWidth: "100%" }}>
                      <option value="">—</option>
                      {companyList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              <h3 className={styles.groupTitle}>۲. محصول</h3>
              <label style={{ display: "block" }}>
                <input type="radio" name="productMode" value="existing" defaultChecked={suggested.length > 0 || !!dup.listing?.productId} /> وصل به محصول موجود:{" "}
                <select name="productId" defaultValue={dup.listing?.productId ?? ""} className={ui.select} style={{ display: "inline-block", width: "auto", maxWidth: "100%" }}>
                  <option value="">—</option>
                  {suggested.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.titleFa}
                      {x.status !== "published" ? " (پیش‌نویس)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "block", marginInlineStart: 24 }}>
                <input type="checkbox" name="updatePacking" value="1" /> وزن، کارتن و HS محصول موجود را با مقدارهای این صفحه به‌روز کن
              </label>
              <label style={{ display: "block", marginTop: 8 }}>
                <input type="radio" name="productMode" value="new" defaultChecked={suggested.length === 0 && !dup.listing?.productId} /> ساخت محصول تازه (پیش‌نویس)
              </label>
              <div className={styles.row}>
                <Field label="اسم فارسی محصول" name="titleFa" maxLength={200} hint="ترجمه‌ی خودکار در مرحله‌ی بعد؛ فعلاً دستی." />
                <Field label="slug" name="slug" defaultValue={slugify(v.title)} ltr maxLength={100} />
                <label className={ui.field}>
                  <span className={ui.label}>دسته</span>
                  <select name="categoryId" defaultValue={suggestedCat ?? ""} className={ui.select}>
                    <option value="">— بدون دسته —</option>
                    {tree.map((c) => (
                      <option key={c.id} value={c.id}>
                        {categoryLabel(c)}
                        {c.id === suggestedCat ? " (پیشنهاد)" : ""}
                      </option>
                    ))}
                    {canCategories && <option value="new">+ دسته‌ی تازه…</option>}
                  </select>
                </label>
              </div>
              {canCategories && (
                <div className={styles.row}>
                  <Field label="دسته‌ی تازه: اسم فارسی" name="newCategoryFa" maxLength={100} />
                  <Field label="اسم انگلیسی" name="newCategoryEn" defaultValue={p.categoryPath.at(-1) ?? ""} ltr maxLength={100} />
                  <label className={ui.field}>
                    <span className={ui.label}>زیرِ</span>
                    <select name="newCategoryParent" defaultValue="" className={ui.select}>
                      <option value="">— ریشه —</option>
                      {tree.map((c) => (
                        <option key={c.id} value={c.id}>
                          {categoryLabel(c)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <p className={styles.muted} style={{ fontSize: 12, margin: 0 }}>
                محصول تازه همیشه «پیش‌نویس» ساخته می‌شود؛ انتشار از صفحه‌ی محصول و با دسترسی «انتشار محصول».
              </p>

              <h3 className={styles.groupTitle}>۳. عکس‌ها</h3>
              <AllPublicButton className={styles.btnGhost} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }} data-testid="register-images">
                {images.map((img) => (
                  <div key={img.id} style={{ width: 120, fontSize: 12 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/admin/import/image/${img.id}`}
                      alt=""
                      width={120}
                      height={120}
                      style={{ objectFit: "contain", background: "#f4f4f4", borderRadius: 8 }}
                      loading="lazy"
                    />
                    <label style={{ display: "block" }}>
                      <input type="checkbox" name="image" value={img.id} defaultChecked={!dup.listing} /> برای محصول
                    </label>
                    <label style={{ display: "block" }}>
                      <input type="checkbox" name={`public_${img.id}`} value="1" /> عمومی
                    </label>
                  </div>
                ))}
              </div>
              <p className={styles.muted} style={{ fontSize: 12, margin: 0 }}>
                پیش‌فرض: همه برای محصول (اگر لیستینگ از قبل هست هیچ‌کدام، تا عکس تکراری نشود)، هیچ‌کدام عمومی. عکس‌ها از همین دیتابیس سرو می‌شوند و با استقرار پاک نمی‌شوند.
              </p>
            </ActionForm>
          )}
        </div>
      )}

      <div className={styles.grid} style={{ marginTop: 16 }}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>مشخصات ({fmtNum(p.attributes.length)})</h2>
          <table className={styles.table} data-testid="attributes">
            <tbody>
              {p.attributes.map((x, i) => (
                <tr key={i}>
                  <td dir="ltr" style={{ fontSize: 13 }}>
                    {x.name}
                  </td>
                  <td dir="ltr" style={{ fontSize: 13 }}>
                    {x.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Highlights ({fmtNum(p.highlights.length)})</h2>
          <ul dir="ltr" style={{ margin: 0, paddingInlineStart: 20, fontSize: 13 }} data-testid="highlights">
            {p.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
          {!p.highlights.length && <p className={styles.muted}>ویژگی واقعی‌ای نوشته نشده.</p>}
          {(p.promoPhrases?.length ?? 0) > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary className={styles.muted}>عبارت‌های تبلیغاتی ({fmtNum(p.promoPhrases.length)}؛ در توضیح محصول استفاده نمی‌شوند)</summary>
              <ul dir="ltr" style={{ margin: 0, paddingInlineStart: 20, fontSize: 12 }} className={styles.muted} data-testid="promo">
                {p.promoPhrases.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </>
  );
}
