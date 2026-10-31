import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import ui from "@/components/ui/ui.module.css";
import { db } from "@/db/client";
import { rawPageImages, rawPages, users } from "@/db/schema";
import { can, requirePermission } from "@/lib/auth/can";
import { importReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum, unitFa } from "@/lib/format";
import { type AlibabaPage, type FieldStatus, PARSER_VERSION } from "@/lib/import/alibaba/parse";
import { duplicatesOf, RAW_STATUS_FA } from "@/lib/import/service";
import styles from "../../panel.module.css";
import { rejectAction, reparseAction, restoreAction, reviewedAction } from "../actions";

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
const dims = (d: { l: number; w: number; h: number } | null) => (d ? `${fmtNum(d.l)}×${fmtNum(d.w)}×${fmtNum(d.h)} سانتی‌متر` : "—");

// صفحه‌ی بررسی (فقط خواندنی؛ اصلاح و ثبت در PR سوم). docs/infoyaarchin.md بخش ۳۶.
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
      reviewedAt: rawPages.reviewedAt,
      uploader: users.fullName,
    })
    .from(rawPages)
    .leftJoin(users, eq(users.id, rawPages.uploadedBy))
    .where(eq(rawPages.id, id));
  if (!page) notFound();
  const p = page.parsed as AlibabaPage;
  const [images, dup, seeSupplier, seeLinks] = await Promise.all([
    db
      .select({ id: rawPageImages.id, url: rawPageImages.url, size: rawPageImages.size })
      .from(rawPageImages)
      .where(eq(rawPageImages.rawPageId, id))
      .orderBy(asc(rawPageImages.position)),
    duplicatesOf(page),
    can(a.user, "companies.view"),
    can(a.user, "companies.links"),
  ]);
  const sym = p.currency === "CNY" ? "¥" : "$";
  const unit = unitFa(p.unit ?? "piece");
  const range = (min: number, max: number | null) => (max ? `${fmtNum(min)} تا ${fmtNum(max)}` : `${fmtNum(min)} و بیشتر`);
  const s = p.supplier;
  const pk = p.packing;
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle} dir="auto">
            {p.title ?? "(بدون عنوان)"}
          </h1>
          <p className={styles.pageSub}>
            <Link href="/admin/import">ورود از علی‌بابا</Link> · {RAW_STATUS_FA[page.status]} · آپلود {fmtDateTime(page.createdAt)} ({page.uploader ?? "—"}) ·{" "}
            {page.fileName ?? "فایل"} ({fmtNum(Math.round(page.fileBytes / 1024))} کیلوبایت)
            {seeLinks && p.productUrl && (
              <>
                {" "}
                ·{" "}
                <a href={p.productUrl} target="_blank" rel="noreferrer noopener">
                  صفحه‌ی محصول در علی‌بابا ↗
                </a>
              </>
            )}
          </p>
        </div>
      </div>

      {(dup.samePage.length > 0 || dup.listing || dup.company) && (
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
                .{" "}
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
            {Object.entries(p.fields).map(([k, v]) => (
              <span key={k} className={`${styles.badge} ${STATUS_BADGE[v][1] ? styles[STATUS_BADGE[v][1]] : ""}`} title={STATUS_BADGE[v][0]}>
                {FIELD_FA[k] ?? k}: {STATUS_BADGE[v][0]}
              </span>
            ))}
          </div>
          <p className={styles.muted} style={{ fontSize: 12, marginBottom: 0 }}>
            خوانده‌شده با خواننده‌ی نسخه‌ی {fmtNum(page.parserVersion)}
            {page.parserVersion < PARSER_VERSION ? ` (نسخه‌ی فعلی ${fmtNum(PARSER_VERSION)}؛ «خواندن دوباره» را بزنید)` : ""}.
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
            <button type="button" className={styles.btnGhost} disabled title="در مرحله‌ی بعد (PR سوم)">
              ثبت فروشنده و محصول (به‌زودی)
            </button>
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
        </div>
      </div>

      <div className={styles.grid} style={{ marginTop: 16 }}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>قیمت و سفارش</h2>
          {p.priceTiers.length ? (
            <table className={styles.table} data-testid="price-tiers">
              <thead>
                <tr>
                  <th>تعداد ({unit})</th>
                  <th>قیمت واحد</th>
                </tr>
              </thead>
              <tbody>
                {p.priceTiers.map((t, i) => (
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
            حداقل سفارش: {p.moq ? `${fmtNum(p.moq)} ${unit}` : "—"}
            {p.customization.length > 0 && <> · سفارشی‌سازی: {p.customization.map((c) => `${c.name}${c.moq ? ` (حداقل ${fmtNum(c.moq)})` : ""}`).join("، ")}</>}
            {p.options.length > 0 && <> · {p.options.map((o) => `${o.name}: ${o.values.join("، ")}${o.customizable ? " (سفارشی‌پذیر)" : ""}`).join(" · ")}</>}
          </p>
          <h3 className={styles.groupTitle}>زمان آماده‌سازی</h3>
          {p.leadTimes.length ? (
            <table className={styles.table}>
              <tbody>
                {p.leadTimes.map((t, i) => (
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
          <h3 className={styles.groupTitle}>بسته‌بندی</h3>
          <p style={{ fontSize: 14, margin: 0 }} data-testid="packing">
            وزن تکی: {pk.unitWeightKg !== null ? `${fmtNum(pk.unitWeightKg)} کیلوگرم` : "—"} · ابعاد تکی: {dims(pk.unitDimsCm)} · تعداد در کارتن:{" "}
            {pk.unitsPerCarton ? fmtNum(pk.unitsPerCarton) : "—"}
            <br />
            وزن کارتن: {pk.cartonWeightKg !== null ? `${fmtNum(pk.cartonWeightKg)} کیلوگرم` : "—"}
            {pk.estimated.cartonWeightKg && <span className={`${styles.badge} ${styles.badgeWarn}`}>تخمینی</span>} · ابعاد کارتن: {dims(pk.cartonDimsCm)}
            {pk.estimated.cartonDimsCm && <span className={`${styles.badge} ${styles.badgeWarn}`}>تخمینی</span>}
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
              <p style={{ fontSize: 14 }}>
                {TYPE_FA[s.type ?? ""] ?? "—"} · {s.country ?? "—"} · {s.years !== null ? `${fmtNum(s.years)} سال در علی‌بابا` : "سابقه نامعلوم"}
                {s.rating !== null && <> · امتیاز {fmtNum(s.rating)}</>}
              </p>
              <p className={styles.muted} style={{ fontSize: 13 }}>
                درآمد: <span className={styles.ltr}>{s.revenue ?? "—"}</span> · پاسخ: <span className={styles.ltr}>{s.responseTime ?? "—"}</span> · ارسال به‌موقع:{" "}
                <span className={styles.ltr}>{s.onTimeRate ?? "—"}</span>
                {s.storeId && (
                  <>
                    {" "}
                    · شناسه‌ی فروشگاه: <span className={styles.ltr}>{s.storeId}</span>
                  </>
                )}
              </p>
            </>
          ) : (
            <p className={styles.muted}>اطلاعات فروشنده فقط با دسترسی «دیدن کارخانه‌ها».</p>
          )}
          <h3 className={styles.groupTitle}>محل تولید و دسته در علی‌بابا</h3>
          <p style={{ fontSize: 14, margin: 0 }}>
            {p.placeOfOrigin ?? "—"} · <span dir="ltr">{p.categoryPath.join(" › ") || "—"}</span>
          </p>
        </div>
      </div>

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
          عکس‌های توضیحات ({fmtNum(p.descriptionImages.length)}) فقط لینک‌اند و ذخیره نمی‌شوند. همه‌ی عکس‌ها پیش‌فرض غیرعمومی‌اند؛ انتخاب برای سایت در مرحله‌ی ثبت.
        </p>
      </div>

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
          <ul dir="ltr" style={{ margin: 0, paddingInlineStart: 20, fontSize: 13 }}>
            {p.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
