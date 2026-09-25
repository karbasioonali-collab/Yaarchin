import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/can";
import { catalogReady } from "@/lib/db-ready";
import { fmtDateTime } from "@/lib/format";
import { getBlock } from "@/lib/site/get";
import panel from "../panel.module.css";
import { BLOCK_PAGES } from "./blocks-meta";
import styles from "./site.module.css";

export const metadata: Metadata = { title: "محتوای سایت" };

export default async function SiteContentPage() {
  await requirePermission("site.manage");
  const ready = await catalogReady();
  const blocks = await Promise.all(BLOCK_PAGES.map(async (b) => ({ ...b, block: await getBlock(b.key) })));
  return (
    <>
      <div className={panel.pageHead}>
        <div>
          <h1 className={panel.pageTitle}>محتوای سایت</h1>
          <p className={panel.pageSub}>هر بخش جدا ویرایش می‌شود و هر زیربخش را می‌توان مخفی کرد. تا وقتی ذخیره نکنید، مقدار پیش‌فرض نمایش داده می‌شود.</p>
        </div>
        <Link href="/" target="_blank" className={panel.btnGhost}>
          دیدن سایت ↗
        </Link>
      </div>
      {!ready && (
        <div className={panel.impersonation}>جدول‌های سایت هنوز ساخته نشده‌اند. در کنسول لیارا npm run db:migrate را اجرا کنید.</div>
      )}
      <div className={styles.blocks}>
        {blocks.map((b) => (
          <Link key={b.slug} href={`/admin/site/${b.slug}`} className={styles.blockCard}>
            <div className={styles.blockTitle}>{b.title}</div>
            <div className={styles.blockDesc}>{b.desc}</div>
            <div className={styles.blockMeta}>
              {b.block.updatedAt ? `آخرین تغییر: ${fmtDateTime(b.block.updatedAt)}` : "پیش‌فرض (هنوز ویرایش نشده)"}
              {!b.block.isVisible && " · مخفی"}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
