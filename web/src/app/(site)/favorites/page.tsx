import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/site/ProductCard";
import { FavoriteButton } from "@/components/site/ProductActions";
import s from "@/components/site/site.module.css";
import { productCardsByIds } from "@/lib/catalog/public";
import { requireCustomer } from "@/lib/customer/auth";
import { favoriteProductIds } from "@/lib/customer/favorites";
import { isEnabled } from "@/lib/settings";
import styles from "../account/account.module.css";
import { AccountShell } from "../account/AccountShell";
import g from "./favorites.module.css";

export const metadata: Metadata = { title: "علاقه‌مندی‌ها", robots: { index: false } };

// علاقه‌مندی‌های مشتری. واردنشده ← ورود و بعد برگشت به همین صفحه.
export default async function FavoritesPage() {
  if (!(await isEnabled("favorites"))) notFound();
  const a = await requireCustomer("/favorites");
  const items = await productCardsByIds(await favoriteProductIds(a.user.id));
  return (
    <AccountShell title="علاقه‌مندی‌ها" name={a.user.fullName}>
      {items.length ? (
        <div className={g.grid}>
          {items.map((p) => (
            <div key={p.slug} className={g.item}>
              <ProductCard p={p} />
              <FavoriteButton slug={p.slug} initial compact refreshOnChange className={`${s.iconBtn} ${g.remove}`} />
            </div>
          ))}
        </div>
      ) : (
        <div className={`${styles.card} ${styles.empty}`}>
          <strong>هنوز محصولی ذخیره نکرده‌اید</strong>
          در صفحه‌ی هر محصول، با دکمه‌ی قلب آن را اینجا نگه دارید.
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
