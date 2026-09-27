import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { requireAnyPermission } from "@/lib/auth/can";
import { PRODUCT_STATUS_FA } from "@/lib/catalog/admin-labels";
import { fmtNum } from "@/lib/format";
import { currencyRows } from "@/lib/pricing/admin";
import { RATE_PERMS } from "@/lib/pricing/labels";
import { hsInList, normHs, rateSnapshot } from "@/lib/pricing/snapshot";
import styles from "../../panel.module.css";

export const metadata: Metadata = { title: "محصولات با اطلاعات ناقص" };

// محصول‌هایی (منتشرشده و پیش‌نویس) که ماشین‌حساب برایشان «استعلام» نشان می‌دهد، و دلیلش.
// کمبودهای عمومی (نرخ ارز، روش حمل، مالیات) بالای صفحه جدا آمده‌اند چون روی همه‌ی محصول‌ها اثر دارند.
export default async function MissingPage() {
  await requireAnyPermission(RATE_PERMS);
  const [prods, curs, snap] = await Promise.all([
    db.execute<{
      id: string;
      title_fa: string;
      status: string;
      hs_code: string | null;
      has_price: boolean;
      price_currencies: string[] | null;
      units_per_carton: number | null;
      dims: boolean;
      weight: boolean;
    }>(sql`
      select p.id, p.title_fa, p.status, p.hs_code, p.units_per_carton,
             (p.carton_length_cm is not null and p.carton_width_cm is not null and p.carton_height_cm is not null) as dims,
             (p.carton_weight_kg is not null or p.unit_weight_kg is not null) as weight,
             exists (select 1 from price_observations po join product_listings pl on pl.id = po.listing_id and pl.status = 'active'
                     join companies c on c.id = pl.company_id and c.status = 'active' where pl.product_id = p.id) as has_price,
             (select array_agg(distinct po.currency) from price_observations po join product_listings pl on pl.id = po.listing_id and pl.status = 'active'
                     where pl.product_id = p.id) as price_currencies
      from products p where p.status <> 'archived' order by p.status desc, p.title_fa`),
    currencyRows(),
    rateSnapshot(""),
  ]);
  const inList = await hsInList([...new Set(prods.rows.map((p) => normHs(p.hs_code)).filter((c): c is string => !!c))]);

  const global: string[] = [];
  for (const c of curs) if (c.isActive && !c.isBase && !c.market) global.push(`نرخ بازار ${c.nameFa} هیچ‌وقت ثبت نشده`);
  if (!snap.shipping.some((m) => m.isActive)) global.push("هیچ روش حمل فعالی نیست");
  if (!snap.tax) global.push("درصد مالیات ارزش افزوده ثبت نشده");

  const rows = prods.rows
    .map((p) => {
      const issues: string[] = [];
      if (!p.has_price) issues.push("قیمت کارخانه");
      else for (const c of p.price_currencies ?? []) if (!snap.market[c]) issues.push(`نرخ ${c}`);
      const pack = [!p.units_per_carton && "تعداد در کارتن", !p.dims && "ابعاد کارتن", !p.weight && "وزن"].filter(Boolean);
      if (pack.length) issues.push(`بسته‌بندی (${pack.join("، ")})`);
      const hs = normHs(p.hs_code);
      if (!p.hs_code) issues.push("HS code ثبت نشده");
      else if (!hs || !inList.has(hs)) issues.push(`HS code ${p.hs_code} در لیست نیست`);
      return { ...p, hs, issues };
    })
    .filter((p) => p.issues.length);

  return (
    <>
      {global.length > 0 && (
        <div className={styles.rateWarn}>
          <span>روی همه‌ی محصول‌ها اثر دارد: {global.join("؛ ")}.</span>
        </div>
      )}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{fmtNum(rows.length)} محصول با اطلاعات ناقص برای ماشین‌حساب</h2>
        <p className={styles.muted} style={{ marginTop: -6, fontSize: 13 }}>
          برای این محصول‌ها سایت به‌جای عدد «استعلام از کارشناس» نشان می‌دهد. وزن و ابعاد در صفحه‌ی محصول، HS code در صفحه‌ی محصول یا لیست HS.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>محصول</th>
                <th>کمبود</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/products/${p.id}`}>{p.title_fa}</Link> <span className={`${styles.badge} ${styles.badgeMuted}`}>{PRODUCT_STATUS_FA[p.status]}</span>
                  </td>
                  <td style={{ fontSize: 14 }}>
                    {p.issues.map((i) => (
                      <span key={i} className={`${styles.badge} ${styles.badgeWarn}`}>
                        {i}
                      </span>
                    ))}
                  </td>
                  <td>
                    <Link href={`/admin/rates/calculator?product=${p.id}`} style={{ fontSize: 13 }}>
                      ماشین‌حساب
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className={styles.muted}>همه‌ی محصول‌ها اطلاعات لازم را دارند.</p>}
      </div>
    </>
  );
}
