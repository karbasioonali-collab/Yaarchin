import Link from "next/link";
import type { ProductCard as Card } from "@/lib/catalog/public";
import { fmtMoney, fmtNum, unitFa } from "@/lib/format";
import { Icon } from "./Icon";
import styles from "./ProductCard.module.css";

export function ProductCard({ p, priority = false }: { p: Card; priority?: boolean }) {
  return (
    <Link href={`/p/${p.slug}`} className={styles.card}>
      <span className={styles.media}>
        {p.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.coverUrl} alt={p.titleFa} width={400} height={400} loading={priority ? "eager" : "lazy"} />
        ) : (
          <Icon name="box" size={40} />
        )}
        {p.suppliers > 0 && (
          <span className={styles.badge}>
            <Icon name="factory" size={14} />
            {fmtNum(p.suppliers)} کارخانه
          </span>
        )}
      </span>
      <span className={styles.body}>
        {p.categoryName && <span className={styles.cat}>{p.categoryName}</span>}
        <span className={styles.title}>{p.titleFa}</span>
        {p.price ? (
          <span className={styles.price}>
            <span className={styles.priceLabel}>میانگین قیمت هر {unitFa(p.price.unit)}</span>
            <span className={styles.priceValue}>
              {fmtMoney(p.price.avg)} <small>دلار</small>
            </span>
            <span className={styles.range}>
              بازه: {fmtMoney(p.price.min)} تا {fmtMoney(p.price.max)}
            </span>
          </span>
        ) : (
          <span className={styles.noPrice}>قیمت به‌زودی</span>
        )}
      </span>
    </Link>
  );
}

export function ProductGrid({ items, priorityCount = 0 }: { items: Card[]; priorityCount?: number }) {
  return (
    <div className={styles.grid}>
      {items.map((p, i) => (
        <ProductCard key={p.slug} p={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}
