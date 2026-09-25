import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { PublicCategory } from "@/lib/catalog/public";
import type { HeaderData } from "@/lib/site/blocks";
import { CategoriesMenu, MobileMenu } from "./HeaderMenus";
import { Icon } from "./Icon";
import styles from "./Header.module.css";
import s from "./site.module.css";

// کاربر واردشده: مشتری ← «حساب من»؛ کارمند ← لینک پنل؛ null ← «ورود»
export type Viewer = { kind: "customer"; name: string } | { kind: "staff" } | null;

export function Header({
  data,
  categories,
  favoritesEnabled,
  viewer,
}: {
  data: HeaderData;
  categories: PublicCategory[];
  favoritesEnabled: boolean;
  viewer: Viewer;
}) {
  const { topBar, nav, categoriesMenu, account, cta } = data;
  const showCategories = categoriesMenu.visible && categories.length > 0;
  return (
    <>
      {topBar.visible && (topBar.text || topBar.phone) && (
        <div className={styles.topBar}>
          <div className={`${s.container} ${styles.topBarInner}`}>
            <span className={styles.topBarText}>{topBar.text}</span>
            {topBar.phone && (
              <a href={`tel:${topBar.phone.replace(/[^\d+]/g, "")}`} className={styles.topBarPhone}>
                <Icon name="phone" size={15} />
                <span className={s.ltr}>{topBar.phone}</span>
              </a>
            )}
          </div>
        </div>
      )}
      <header className={styles.header}>
        <div className={`${s.container} ${styles.inner}`}>
          <MobileMenu nav={nav.visible ? nav.links : []} categories={showCategories ? categories : []} categoriesLabel={categoriesMenu.label} cta={cta.visible && cta.label && cta.href ? cta : null} />
          <Link href="/" className={styles.logo} aria-label="یارچین — صفحه‌ی اصلی">
            <Logo size="sm" tagline={false} />
          </Link>
          <nav className={styles.nav} aria-label="منوی اصلی">
            {showCategories && <CategoriesMenu categories={categories} label={categoriesMenu.label} />}
            {nav.visible &&
              nav.links.map((l) => (
                <Link key={l.href + l.label} href={l.href} className={styles.navLink}>
                  {l.label}
                </Link>
              ))}
          </nav>
          <div className={styles.actions}>
            {account.visible && favoritesEnabled && (
              <Link href="/favorites" className={s.iconBtn} aria-label="علاقه‌مندی‌ها" title="علاقه‌مندی‌ها">
                <Icon name="heart" />
              </Link>
            )}
            {account.visible &&
              (viewer?.kind === "customer" ? (
                <Link href="/account" className={styles.account} aria-label="حساب من">
                  <Icon name="user" />
                  <span className={styles.accountLabel}>{viewer.name.split(" ")[0]}</span>
                </Link>
              ) : viewer?.kind === "staff" ? (
                <Link href="/admin" className={styles.account} aria-label="پنل مدیریت">
                  <Icon name="user" />
                  <span className={styles.accountLabel}>پنل</span>
                </Link>
              ) : (
                <Link href="/login" className={styles.account} aria-label="ورود یا ثبت‌نام">
                  <Icon name="user" />
                  <span className={styles.accountLabel}>ورود</span>
                </Link>
              ))}
            {cta.visible && cta.label && cta.href && (
              <Link href={cta.href} className={`${s.btn} ${styles.cta}`}>
                {cta.label}
              </Link>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
