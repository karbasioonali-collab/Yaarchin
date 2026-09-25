"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import type { PublicCategory } from "@/lib/catalog/public";
import type { SiteLink } from "@/lib/site/blocks";
import { Icon } from "./Icon";
import styles from "./Header.module.css";
import s from "./site.module.css";

// با عوض شدن صفحه منو بسته می‌شود
function useCloseOnNavigate(close: () => void) {
  const path = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    close();
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
}

// منوی دسته‌ها در دسکتاپ: دو سطح اول؛ سطح‌های پایین‌تر در صفحه‌ی هر دسته
export function CategoriesMenu({ categories, label }: { categories: PublicCategory[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useCloseOnNavigate(() => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.catMenu} ref={ref}>
      <button type="button" className={`${styles.navLink} ${styles.catButton}`} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <Icon name="grid" size={18} />
        {label}
        <Icon name="chevronDown" size={16} className={open ? styles.rotated : undefined} />
      </button>
      <div id={panelId} className={styles.catPanel} hidden={!open}>
        <div className={styles.catGrid}>
          {categories.map((c) => (
            <div key={c.slug} className={styles.catCol}>
              <Link href={`/c/${c.slug}`} className={styles.catTitle}>
                {c.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt="" width={40} height={40} className={styles.catThumb} />
                )}
                {c.nameFa}
              </Link>
              <ul className={styles.catList}>
                {c.children.map((ch) => (
                  <li key={ch.slug}>
                    <Link href={`/c/${ch.slug}`}>{ch.nameFa}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Link href="/categories" className={styles.catAll}>
          همه‌ی دسته‌بندی‌ها
          <Icon name="chevronLeft" size={16} />
        </Link>
      </div>
    </div>
  );
}

function CategoryTree({ items, depth = 0 }: { items: PublicCategory[]; depth?: number }) {
  return (
    <ul className={styles.treeList} data-depth={depth}>
      {items.map((c) => (
        <li key={c.slug}>
          {c.children.length ? (
            <details className={styles.treeItem}>
              <summary>
                <Link href={`/c/${c.slug}`}>{c.nameFa}</Link>
                <Icon name="chevronDown" size={16} className={styles.treeChevron} />
              </summary>
              <CategoryTree items={c.children} depth={depth + 1} />
            </details>
          ) : (
            <Link href={`/c/${c.slug}`} className={styles.treeLeaf}>
              {c.nameFa}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

// منوی کشویی موبایل (دکمه‌ی همبرگری فقط در موبایل دیده می‌شود)
export function MobileMenu({
  nav,
  categories,
  categoriesLabel,
  cta,
}: {
  nav: SiteLink[];
  categories: PublicCategory[];
  categoriesLabel: string;
  cta: SiteLink | null;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useCloseOnNavigate(() => setOpen(false));

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button type="button" className={`${s.iconBtn} ${styles.burger}`} aria-label="منو" onClick={() => setOpen(true)}>
        <Icon name="menu" />
      </button>
      <dialog
        ref={dialog}
        className={styles.drawer}
        aria-label="منو"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      >
        <div className={styles.drawerBody}>
          <div className={styles.drawerHead}>
            <Logo size="sm" tagline={false} gradientId="yarchin-arc-drawer" />
            <button type="button" className={s.iconBtn} aria-label="بستن منو" onClick={() => setOpen(false)}>
              <Icon name="close" />
            </button>
          </div>
          {nav.length > 0 && (
            <nav className={styles.drawerNav}>
              {nav.map((l) => (
                <Link key={l.href + l.label} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </nav>
          )}
          {categories.length > 0 && (
            <div className={styles.drawerSection}>
              <div className={styles.drawerLabel}>{categoriesLabel}</div>
              <CategoryTree items={categories} />
            </div>
          )}
          {cta && (
            <Link href={cta.href} className={`${s.btn} ${styles.drawerCta}`}>
              {cta.label}
            </Link>
          )}
        </div>
      </dialog>
    </>
  );
}
