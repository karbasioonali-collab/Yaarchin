import Link from "next/link";
import type { PublicCategory } from "@/lib/catalog/public";
import { fmtNum } from "@/lib/format";
import { Icon } from "./Icon";
import styles from "./CategoryBoxes.module.css";

// باکس شاخه‌های دسته‌بندی. هر باکس زیرشاخه‌های مستقیمش را هم نشان می‌دهد؛
// با رفتن به صفحه‌ی هر دسته، زیرشاخه‌هایش دوباره به همین شکل می‌آیند (عمق نامحدود).
export function CategoryBoxes({ items }: { items: PublicCategory[] }) {
  return (
    <div className={styles.grid}>
      {items.map((c, i) => (
        <article key={c.slug} className={`${styles.box} ${i % 2 ? styles.alt : ""}`}>
          <Link href={`/c/${c.slug}`} className={styles.head}>
            <span className={styles.thumb}>
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt="" width={120} height={120} loading="lazy" />
              ) : (
                <Icon name="box" size={36} />
              )}
            </span>
            <span className={styles.info}>
              <span className={styles.name}>{c.nameFa}</span>
              <span className={styles.count}>
                {c.productCount ? `${fmtNum(c.productCount)} محصول` : "به‌زودی"}
                {c.children.length > 0 && ` · ${fmtNum(c.children.length)} زیرشاخه`}
              </span>
              {c.descriptionFa && <span className={styles.desc}>{c.descriptionFa}</span>}
            </span>
            <Icon name="chevronLeft" size={20} className={styles.arrow} />
          </Link>
          {c.children.length > 0 && (
            <ul className={styles.children}>
              {c.children.map((ch) => (
                <li key={ch.slug}>
                  <Link href={`/c/${ch.slug}`} className={styles.child}>
                    {ch.nameFa}
                    {ch.children.length > 0 && <span className={styles.more}>+{fmtNum(ch.children.length)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
