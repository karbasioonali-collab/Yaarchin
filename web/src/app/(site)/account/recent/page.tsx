import type { Metadata } from "next";
import Link from "next/link";
import { ProductGrid } from "@/components/site/ProductCard";
import s from "@/components/site/site.module.css";
import { productCardsByIds } from "@/lib/catalog/public";
import { requireCustomer } from "@/lib/customer/auth";
import { recentProductIds } from "@/lib/customer/events";
import styles from "../account.module.css";
import { AccountShell } from "../AccountShell";

export const metadata: Metadata = { title: "بازدیدهای اخیر", robots: { index: false } };

// آخرین محصولاتی که مشتری دیده (از جدول events؛ جدیدترین اول، بدون تکرار)
export default async function RecentPage() {
  const a = await requireCustomer("/account/recent");
  const items = await productCardsByIds(await recentProductIds(a.user.id, 24));
  return (
    <AccountShell title="بازدیدهای اخیر" name={a.user.fullName}>
      {items.length ? (
        <ProductGrid items={items} />
      ) : (
        <div className={`${styles.card} ${styles.empty}`}>
          <strong>هنوز محصولی ندیده‌اید</strong>
          محصولاتی که باز می‌کنید اینجا می‌آیند تا راحت دوباره پیدایشان کنید.
          <p>
            <Link href="/categories" className={s.btn}>
              دیدن دسته‌بندی‌ها
            </Link>
          </p>
        </div>
      )}
    </AccountShell>
  );
}
