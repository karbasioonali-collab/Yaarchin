import type { Metadata } from "next";
import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import { db } from "@/db/client";
import { currencies } from "@/db/schema";
import { can, requireAnyPermission } from "@/lib/auth/can";
import { fmtDateTime } from "@/lib/format";
import { costText } from "@/lib/pricing/cost-text";
import { RATE_PERMS } from "@/lib/pricing/labels";
import styles from "../../panel.module.css";
import { createCostItemAction } from "../actions";
import { CostFields } from "./CostFields";

export const metadata: Metadata = { title: "بیمه و هزینه‌ها" };

// آیتم‌های هزینه (بیمه، ترخیص، …) با اسم دلخواه؛ ساخت آیتم تازه بدون تغییر کد. هر آیتم نسخه‌دار است (صفحه‌ی هر آیتم).
export default async function CostsPage() {
  const a = await requireAnyPermission(RATE_PERMS);
  const canManage = await can(a.user, "costs.manage");
  const [items, curs] = await Promise.all([
    db.execute<{
      id: string;
      name_fa: string;
      is_active: boolean | null;
      calc_type: string | null;
      amount: string | null;
      percent_base: string[] | null;
      formula: string | null;
      currency_code: string | null;
      methods: string[] | null;
      valid_from: Date | null;
      versions: number;
    }>(sql`
      select i.id, i.name_fa, v.is_active, v.calc_type, v.amount, v.percent_base, v.formula, v.currency_code, v.methods, v.valid_from,
             (select count(*)::int from cost_item_versions x where x.item_id = i.id) as versions
      from cost_items i
      left join lateral (select * from cost_item_versions x where x.item_id = i.id and x.valid_from <= now() order by x.valid_from desc, x.id desc limit 1) v on true
      order by i.sort_order, i.created_at`),
    db.select().from(currencies).orderBy(asc(currencies.sortOrder)),
  ]);
  const curName = (c: string) => curs.find((x) => x.code === c)?.nameFa ?? c;

  return (
    <div className={styles.grid}>
      <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
        <h2 className={styles.cardTitle}>آیتم‌ها</h2>
        <p className={styles.muted} style={{ marginTop: -6, fontSize: 13 }}>
          هر آیتم به ارز خودش حساب و با نرخ بازار به تومان تبدیل می‌شود. درصدی‌ها از ارزش کالا و/یا هزینه‌ی حمل همان روش حساب می‌شوند.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>اسم</th>
                <th>محاسبه‌ی فعلی</th>
                <th>وضعیت</th>
                <th>از</th>
              </tr>
            </thead>
            <tbody>
              {items.rows.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`/admin/rates/costs/${i.id}`}>{i.name_fa}</Link>
                    <div className={styles.muted} style={{ fontSize: 12 }}>
                      {i.versions.toLocaleString("fa-IR")} نسخه
                    </div>
                  </td>
                  <td style={{ fontSize: 14 }}>
                    {i.calc_type
                      ? costText(
                          { calcType: i.calc_type, amount: i.amount, percentBase: i.percent_base, formula: i.formula, currencyCode: i.currency_code, methods: i.methods },
                          curName,
                        )
                      : "نسخه‌ی فعلی ندارد (فقط زمان‌بندی‌شده)"}
                  </td>
                  <td>{i.is_active ? <span className={styles.badge}>فعال</span> : <span className={`${styles.badge} ${styles.badgeMuted}`}>غیرفعال</span>}</td>
                  <td className={styles.muted} style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                    {fmtDateTime(i.valid_from)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.rows.length && <p className={styles.muted}>هنوز آیتمی تعریف نشده. مثلاً «بیمه»: ۰٫۵٪ از ارزش کالا + هزینه‌ی حمل.</p>}
      </div>

      {canManage && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>آیتم تازه</h2>
          <ActionForm action={createCostItemAction} submitLabel="ساخت آیتم">
            <Field label="اسم (دلخواه)" name="nameFa" maxLength={100} placeholder="بیمه، ترخیص، حمل داخلی، …" required />
            <CostFields currencies={curs.filter((c) => c.isActive).map((c) => ({ code: c.code, nameFa: c.nameFa }))} />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
