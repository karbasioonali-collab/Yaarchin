import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { currencies } from "@/db/schema";
import { can, requireAnyPermission } from "@/lib/auth/can";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { dutyText, type HsRow } from "@/lib/pricing/cost-text";
import { RATE_PERMS } from "@/lib/pricing/labels";
import { normHs } from "@/lib/pricing/snapshot";
import styles from "../../panel.module.css";
import { saveHsAction } from "../actions";
import { HsFields } from "./HsFields";

export const metadata: Metadata = { title: "HS code و حقوق ورودی" };
const PAGE = 50;

// لیست HS code با نسخه‌ی فعلی حقوق ورودی. «محصولات» = تعداد محصول‌هایی که HS code متنی‌شان (فقط رقم‌ها) همین کد است.
export default async function HsPage({ searchParams }: PageProps<"/admin/rates/hs">) {
  const a = await requireAnyPermission(RATE_PERMS);
  const canManage = await can(a.user, "hs.manage");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const digits = q && /^[\d۰-۹٠-٩.\s]+$/.test(q) ? (normHs(q) ?? q.replace(/\D/g, "")) : null;
  const filter = !q ? sql`true` : digits ? sql`v.code like ${digits + "%"}` : sql`v.title_fa ilike ${"%" + q + "%"}`;
  const base = sql`(select distinct on (code) * from hs_code_versions where valid_from <= now() order by code, valid_from desc, id desc) v`;
  const [{ rows }, { rows: countRows }, curs] = await Promise.all([
    db.execute<HsRow>(sql`
      select v.code, v.title_fa, v.is_active, v.duty_type, v.duty_value, v.duty_base, v.duty_currency, v.fixed_per, v.valid_from,
             (select count(*)::int from products p where regexp_replace(coalesce(p.hs_code, ''), '[^0-9]', '', 'g') = v.code) as products
      from ${base} where ${filter} order by v.code limit ${PAGE} offset ${(page - 1) * PAGE}`),
    db.execute<{ n: number }>(sql`select count(*)::int as n from ${base} where ${filter}`),
    db.select().from(currencies).where(eq(currencies.isActive, true)).orderBy(asc(currencies.sortOrder)),
  ]);
  const total = countRows[0]?.n ?? 0;
  const curName = (c: string) => curs.find((x) => x.code === c)?.nameFa ?? c;
  const qs = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className={styles.grid}>
      <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
        <div className={styles.toolbar}>
          <form method="get" style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
            <input name="q" defaultValue={q} placeholder="جستجوی کد یا شرح" aria-label="جستجو" style={{ flex: 1, minWidth: 180 }} />
            <button type="submit" className={styles.btnGhost}>
              جستجو
            </button>
          </form>
          {canManage && (
            <Link href="/admin/rates/hs/import" className={styles.btn}>
              ورود از فایل اکسل/CSV
            </Link>
          )}
        </div>
        <p className={styles.muted} style={{ fontSize: 13, marginTop: 0 }}>
          {fmtNum(total)} کد. فیلد HS code محصول (با یا بدون نقطه) خودکار به کد هم‌رقم این لیست وصل می‌شود.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>کد</th>
                <th>شرح</th>
                <th>حقوق ورودی</th>
                <th>محصولات</th>
                <th>از</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td>
                    <Link href={`/admin/rates/hs/${r.code}`} className={styles.num}>
                      {r.code}
                    </Link>
                    {!r.is_active && <span className={`${styles.badge} ${styles.badgeMuted}`}>غیرفعال</span>}
                  </td>
                  <td style={{ fontSize: 14 }}>{r.title_fa}</td>
                  <td style={{ fontSize: 14 }}>{dutyText(r, curName)}</td>
                  <td>{fmtNum(r.products)}</td>
                  <td className={styles.muted} style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                    {fmtDateTime(r.valid_from)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className={styles.muted}>{q ? "چیزی پیدا نشد." : "لیست خالی است. کد تکی ثبت کنید یا فایل اکسل/CSV وارد کنید."}</p>}
        {total > PAGE && (
          <div className={styles.pager}>
            {page > 1 && <Link href={qs(page - 1)}>← قبلی</Link>}
            <span className={styles.muted}>
              صفحه‌ی {fmtNum(page)} از {fmtNum(Math.ceil(total / PAGE))}
            </span>
            {page * PAGE < total && <Link href={qs(page + 1)}>بعدی →</Link>}
          </div>
        )}
      </div>

      {canManage && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>ثبت یک کد</h2>
          <p className={styles.muted} style={{ marginTop: -6, fontSize: 13 }}>
            اگر کد در لیست باشد، نسخه‌ی تازه ثبت می‌شود و نسخه‌ی قبلی در تاریخچه می‌ماند.
          </p>
          <ActionForm action={saveHsAction} submitLabel="ثبت">
            <input type="hidden" name="redirect" value="detail" />
            <HsFields currencies={curs.map((c) => ({ code: c.code, nameFa: c.nameFa }))} />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
