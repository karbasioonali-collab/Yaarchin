import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { currencies, hsCodeVersions, users } from "@/db/schema";
import { can, requireAnyPermission } from "@/lib/auth/can";
import { PRODUCT_STATUS_FA } from "@/lib/catalog/admin-labels";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { dutyText } from "@/lib/pricing/cost-text";
import { RATE_PERMS } from "@/lib/pricing/labels";
import styles from "../../../panel.module.css";
import { saveHsAction } from "../../actions";
import { HsFields } from "../HsFields";

export const metadata: Metadata = { title: "HS code" };

export default async function HsCodePage({ params }: PageProps<"/admin/rates/hs/[code]">) {
  const a = await requireAnyPermission(RATE_PERMS);
  const { code } = await params;
  if (!/^\d{4,12}$/.test(code)) notFound();
  const canManage = await can(a.user, "hs.manage");
  const [versions, curs, prods] = await Promise.all([
    db
      .select({ v: hsCodeVersions, by: users.fullName })
      .from(hsCodeVersions)
      .leftJoin(users, eq(users.id, hsCodeVersions.createdBy))
      .where(eq(hsCodeVersions.code, code))
      .orderBy(desc(hsCodeVersions.validFrom), desc(hsCodeVersions.id)),
    db.select().from(currencies).orderBy(asc(currencies.sortOrder)),
    db.execute<{ id: string; title_fa: string; status: string; hs_code: string }>(
      sql`select id, title_fa, status, hs_code from products where regexp_replace(coalesce(hs_code, ''), '[^0-9]', '', 'g') = ${code} order by title_fa limit 100`,
    ),
  ]);
  if (!versions.length) notFound();
  const curName = (c: string) => curs.find((x) => x.code === c)?.nameFa ?? c;
  const now = new Date().getTime();
  const current = versions.find((x) => x.v.validFrom.getTime() <= now)?.v;
  const asRow = (v: typeof hsCodeVersions.$inferSelect) => ({
    duty_type: v.dutyType,
    duty_value: v.dutyValue,
    duty_base: v.dutyBase,
    duty_currency: v.dutyCurrency,
    fixed_per: v.fixedPer,
  });

  return (
    <>
      <p className={styles.pageSub} style={{ marginTop: 0 }}>
        <Link href="/admin/rates/hs">HS code</Link> · <span className={styles.num}>{code}</span>
      </p>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span className={styles.num}>{code}</span>{" "}
            {current?.isActive ? (
              <span className={styles.badge}>فعال</span>
            ) : (
              <span className={`${styles.badge} ${styles.badgeMuted}`}>{current ? "غیرفعال" : "زمان‌بندی‌شده"}</span>
            )}
          </h2>
          {current && (
            <>
              <p style={{ margin: 0 }}>{current.titleFa}</p>
              <p style={{ fontSize: 15 }}>حقوق ورودی: {dutyText(asRow(current), curName)}</p>
            </>
          )}
          {canManage && (
            <>
              <h3 className={styles.groupTitle}>نسخه‌ی تازه</h3>
              <ActionForm action={saveHsAction} submitLabel="ثبت نسخه">
                <HsFields currencies={curs.filter((c) => c.isActive).map((c) => ({ code: c.code, nameFa: c.nameFa }))} initial={{ ...(current ?? versions[0].v), code }} lockCode />
              </ActionForm>
              <p className={styles.muted} style={{ fontSize: 13 }}>
                برای برداشتن کد از لیست، نسخه‌ی تازه با تیک «فعال» خاموش ثبت کنید؛ محصول‌های این کد «استعلام» می‌شوند.
              </p>
            </>
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>محصول‌های این کد ({fmtNum(prods.rows.length)})</h2>
          {prods.rows.map((p) => (
            <div key={p.id} className={styles.batch}>
              <Link href={`/admin/products/${p.id}`}>{p.title_fa}</Link> <span className={`${styles.badge} ${styles.badgeMuted}`}>{PRODUCT_STATUS_FA[p.status]}</span>
              <span className={`${styles.muted} ${styles.num}`} style={{ fontSize: 12 }}>
                {p.hs_code}
              </span>
            </div>
          ))}
          {!prods.rows.length && <p className={styles.muted}>هیچ محصولی این کد را ندارد.</p>}

          <h2 className={styles.cardTitle} style={{ marginTop: 20 }}>
            تاریخچه ({fmtNum(versions.length)} نسخه)
          </h2>
          {versions.map(({ v, by }) => (
            <div key={v.id} className={styles.batch}>
              <div className={styles.timelineHead}>
                <strong>از {fmtDateTime(v.validFrom)}</strong>
                {v.validFrom.getTime() > now && <span className={`${styles.badge} ${styles.badgeWarn}`}>زمان‌بندی‌شده</span>}
                {v.id === current?.id && <span className={styles.badge}>فعلی</span>}
                {!v.isActive && <span className={`${styles.badge} ${styles.badgeMuted}`}>غیرفعال</span>}
                <span className={styles.muted}>{by ?? (v.source === "demo" ? "نمونه" : v.source === "import" ? "ورود فایل" : "سیستم")}</span>
              </div>
              <div style={{ fontSize: 14 }}>
                {v.titleFa && <>{v.titleFa} · </>}
                {dutyText(asRow(v), curName)}
              </div>
              {v.note && <div className={styles.muted}>{v.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
