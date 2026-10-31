import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { can, requirePermission } from "@/lib/auth/can";
import { importReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum, unitFa } from "@/lib/format";
import type { AlibabaPage } from "@/lib/import/alibaba/parse";
import { PARSER_VERSION } from "@/lib/import/alibaba/parse";
import { DB_IMAGES_WARN_BYTES, dbImageBytes, MAX_FILE_BYTES, RAW_STATUS_FA } from "@/lib/import/service";
import styles from "../panel.module.css";
import { reparseOldAction } from "./actions";
import { ImportUploader } from "./ImportUploader";

export const metadata: Metadata = { title: "ورود از علی‌بابا" };

const TABS = ["new", "reviewed", "imported", "rejected"] as const;
const mb = (b: number) => fmtNum(Math.round((b / 1024 / 1024) * 10) / 10);

// فهرست صفحه‌های واردشده، آپلود و راهنما (catalog.import). docs/infoyaarchin.md بخش ۳۶.
export default async function ImportPage({ searchParams }: PageProps<"/admin/import">) {
  const a = await requirePermission("catalog.import");
  if (!(await importReady()))
    return <div className={styles.impersonation}>ورود از علی‌بابا بعد از اجرای migration ۰۰۱۲ فعال می‌شود (npm run db:migrate و بعد npm run db:seed).</div>;
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.status)) ? String(sp.status) : "new";
  const seeSupplier = await can(a.user, "companies.view");
  const [rows, counts, imgBytes, oldCount] = await Promise.all([
    db
      .execute<{
        id: string;
        title: string | null;
        status: string;
        created_at: Date;
        parser_version: number;
        parsed: AlibabaPage;
        uploader: string | null;
        same_product: number;
        known_company: boolean;
        listed: boolean;
      }>(
        sql`select p.id, p.title, p.status, p.created_at, p.parser_version, p.parsed, u.full_name as uploader,
          (select count(*)::int from raw_pages q where q.platform = p.platform and q.external_product_id = p.external_product_id and q.id <> p.id) as same_product,
          exists (select 1 from company_external_ids c where c.platform = p.platform and c.external_id = p.store_id) as known_company,
          exists (select 1 from listing_external_ids l where l.platform = p.platform and l.external_id = p.external_product_id) as listed
        from raw_pages p left join users u on u.id = p.uploaded_by
        where p.status = ${tab} order by p.created_at desc limit 200`,
      )
      .then((r) => r.rows),
    db.execute<{ status: string; n: number }>(sql`select status, count(*)::int as n from raw_pages group by status`).then((r) => r.rows),
    dbImageBytes(),
    db.execute<{ n: number }>(sql`select count(*)::int as n from raw_pages where parser_version < ${PARSER_VERSION}`).then((r) => r.rows[0]?.n ?? 0),
  ]);
  const n = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>ورود از علی‌بابا</h1>
          <p className={styles.pageSub}>صفحه‌ی ذخیره‌شده‌ی محصول را آپلود کنید؛ اطلاعات خوانده و برای بررسی نگه داشته می‌شود. ثبت فروشنده و محصول در مرحله‌ی بعد اضافه می‌شود.</p>
        </div>
      </div>
      {imgBytes >= DB_IMAGES_WARN_BYTES && (
        <div className={styles.rateWarn} role="status">
          عکس‌های ذخیره‌شده در دیتابیس از ۱ گیگابایت گذشته ({mb(imgBytes)} مگابایت)؛ وقت راه‌اندازی فضای ابری (S3) لیارا است (docs/infoyaarchin.md بخش ۳۶).
        </div>
      )}
      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>آپلود صفحه</h2>
          <ImportUploader maxMb={MAX_FILE_BYTES / 1024 / 1024} />
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>راهنمای ذخیره‌ی صفحه</h2>
          <ol style={{ margin: 0, paddingInlineStart: 20, fontSize: 14, lineHeight: 1.9 }} data-testid="import-guide">
            <li>صفحه‌ی محصول را در کروم باز کنید و آرام تا پایین اسکرول کنید تا همه‌ی عکس‌ها بارگذاری شوند.</li>
            <li>تب «Attributes» (مشخصات) را باز کنید.</li>
            <li>
              Ctrl+S بزنید و نوع ذخیره را <strong>«Webpage, Single File»</strong> بگذارید (فایل ‎.mhtml).
            </li>
            <li>همان فایل را اینجا آپلود کنید.</li>
          </ol>
          <p className={styles.muted} style={{ fontSize: 12, marginBottom: 0 }}>
            حساب علی‌بابا روی ارز USD باشد. هر فایل یکی‌یکی پردازش می‌شود؛ اگر همزمان کس دیگری آپلود کند، چند ثانیه صبر کنید.
          </p>
        </div>
      </div>

      <nav className={styles.tabs} aria-label="وضعیت" style={{ marginTop: 16 }}>
        {TABS.map((s) => (
          <Link key={s} href={`?status=${s}`} className={`${styles.tab} ${tab === s ? styles.tabActive : ""}`}>
            {RAW_STATUS_FA[s]} ({fmtNum(n(s))})
          </Link>
        ))}
      </nav>
      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>زمان</th>
                <th>محصول</th>
                {seeSupplier && <th>فروشنده</th>}
                <th>قیمت</th>
                <th>حداقل سفارش</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = r.parsed;
                const t = p.priceTiers ?? [];
                return (
                  <tr key={r.id} data-testid="import-row">
                    <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                      {fmtDateTime(r.created_at)}
                      <div className={styles.muted}>{r.uploader ?? "—"}</div>
                    </td>
                    <td>
                      <Link href={`/admin/import/${r.id}`}>{r.title ?? "(بدون عنوان)"}</Link>
                      <div>
                        {r.same_product > 0 && <span className={`${styles.badge} ${styles.badgeWarn}`}>همین محصول {fmtNum(r.same_product)} بار دیگر آپلود شده</span>}
                        {r.listed && <span className={`${styles.badge} ${styles.badgeWarn}`}>لیستینگ موجود است</span>}
                        {r.known_company && <span className={styles.badge}>فروشنده ثبت شده</span>}
                        {r.parser_version < PARSER_VERSION && <span className={`${styles.badge} ${styles.badgeMuted}`}>خواننده‌ی قدیمی</span>}
                      </div>
                    </td>
                    {seeSupplier && <td style={{ fontSize: 13 }}>{p.supplier?.name ?? "—"}</td>}
                    <td className={styles.ltr} style={{ fontSize: 13 }}>
                      {t.length ? `${p.currency === "CNY" ? "¥" : "$"}${t[t.length - 1].price}–${t[0].price}` : "—"}
                    </td>
                    <td style={{ fontSize: 13 }}>{p.moq ? `${fmtNum(p.moq)} ${unitFa(p.unit ?? "piece")}` : "—"}</td>
                    <td style={{ fontSize: 13 }}>{RAW_STATUS_FA[r.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className={styles.muted}>صفحه‌ای نیست.</p>}
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <h2 className={styles.cardTitle}>نگه‌داری</h2>
        <p style={{ marginTop: 0, fontSize: 14 }}>
          عکس‌های ذخیره‌شده در دیتابیس: <strong data-testid="db-image-mb">{mb(imgBytes)}</strong> مگابایت (هشدار در ۱٬۰۲۴). نسخه‌ی خواننده: {fmtNum(PARSER_VERSION)}.
        </p>
        {oldCount > 0 ? (
          <ActionForm action={reparseOldAction} submitLabel={`خواندن دوباره‌ی ${fmtNum(oldCount)} صفحه‌ی قدیمی`} submitVariant="secondary" />
        ) : (
          <p className={styles.muted} style={{ margin: 0, fontSize: 13 }}>
            همه‌ی صفحه‌ها با خواننده‌ی فعلی خوانده شده‌اند.
          </p>
        )}
      </div>
    </>
  );
}
