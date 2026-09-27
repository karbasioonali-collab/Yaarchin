import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import { db } from "@/db/client";
import { costItems, costItemVersions, currencies, users } from "@/db/schema";
import { can, requireAnyPermission } from "@/lib/auth/can";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { costText } from "@/lib/pricing/cost-text";
import { RATE_PERMS } from "@/lib/pricing/labels";
import styles from "../../../panel.module.css";
import { addCostVersionAction, renameCostItemAction } from "../../actions";
import { CostFields } from "../CostFields";

export const metadata: Metadata = { title: "آیتم هزینه" };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function CostItemPage({ params }: PageProps<"/admin/rates/costs/[id]">) {
  const a = await requireAnyPermission(RATE_PERMS);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [item] = await db.select().from(costItems).where(eq(costItems.id, id));
  if (!item) notFound();
  const canManage = await can(a.user, "costs.manage");
  const [versions, curs] = await Promise.all([
    db
      .select({ v: costItemVersions, by: users.fullName })
      .from(costItemVersions)
      .leftJoin(users, eq(users.id, costItemVersions.createdBy))
      .where(eq(costItemVersions.itemId, id))
      .orderBy(desc(costItemVersions.validFrom), desc(costItemVersions.id)),
    db.select().from(currencies).orderBy(asc(currencies.sortOrder)),
  ]);
  const curName = (c: string) => curs.find((x) => x.code === c)?.nameFa ?? c;
  const now = new Date().getTime();
  const current = versions.find((x) => x.v.validFrom.getTime() <= now)?.v;

  return (
    <>
      <p className={styles.pageSub} style={{ marginTop: 0 }}>
        <Link href="/admin/rates/costs">بیمه و هزینه‌ها</Link> · {item.nameFa}
      </p>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            {item.nameFa} {current?.isActive ? <span className={styles.badge}>فعال</span> : <span className={`${styles.badge} ${styles.badgeMuted}`}>غیرفعال</span>}
          </h2>
          <p style={{ fontSize: 14 }}>{current ? costText(current, curName) : "نسخه‌ی فعلی ندارد."}</p>
          {canManage && (
            <>
              <h3 className={styles.groupTitle}>نسخه‌ی تازه</h3>
              <ActionForm action={addCostVersionAction} submitLabel="ثبت نسخه">
                <input type="hidden" name="itemId" value={item.id} />
                <CostFields currencies={curs.filter((c) => c.isActive).map((c) => ({ code: c.code, nameFa: c.nameFa }))} initial={current} />
              </ActionForm>
              <p className={styles.muted} style={{ fontSize: 13 }}>
                برای حذف آیتم، نسخه‌ی تازه با تیک «فعال» خاموش ثبت کنید؛ تاریخچه می‌ماند.
              </p>
              <h3 className={styles.groupTitle}>تغییر اسم</h3>
              <ActionForm action={renameCostItemAction} submitLabel="ذخیره‌ی اسم" submitVariant="secondary">
                <input type="hidden" name="itemId" value={item.id} />
                <Field label="اسم" name="nameFa" defaultValue={item.nameFa} maxLength={100} required />
              </ActionForm>
            </>
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>تاریخچه ({fmtNum(versions.length)} نسخه)</h2>
          {versions.map(({ v, by }) => (
            <div key={v.id} className={styles.batch}>
              <div className={styles.timelineHead}>
                <strong>از {fmtDateTime(v.validFrom)}</strong>
                {v.validFrom.getTime() > now && <span className={`${styles.badge} ${styles.badgeWarn}`}>زمان‌بندی‌شده</span>}
                {v.id === current?.id && <span className={styles.badge}>فعلی</span>}
                {!v.isActive && <span className={`${styles.badge} ${styles.badgeMuted}`}>غیرفعال</span>}
                <span className={styles.muted}>{by ?? (v.source === "demo" ? "نمونه" : "سیستم")}</span>
              </div>
              <div style={{ fontSize: 14 }}>{costText(v, curName)}</div>
              {v.note && <div className={styles.muted}>{v.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
