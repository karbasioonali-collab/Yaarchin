"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import styles from "./MobileTabBar.module.css";

// نوار پایین موبایل (حس اپلیکیشن؛ آماده برای PWA). در صفحه‌ی محصول نوار اقدام خود محصول جایش را می‌گیرد.
export function MobileTabBar({ favoritesEnabled, customer }: { favoritesEnabled: boolean; customer: boolean }) {
  const path = usePathname();
  if (path.startsWith("/p/")) return null;
  const items: { href: string; label: string; icon: IconName; active: boolean }[] = [
    { href: "/", label: "خانه", icon: "home", active: path === "/" },
    { href: "/categories", label: "دسته‌بندی", icon: "grid", active: path === "/categories" || path.startsWith("/c/") },
    ...(favoritesEnabled
      ? [{ href: "/favorites", label: "علاقه‌مندی", icon: "heart" as IconName, active: path === "/favorites" }]
      : []),
    { href: "/contact", label: "تماس", icon: "chat", active: path === "/contact" },
    { href: customer ? "/account" : "/login", label: "حساب", icon: "user", active: path === "/login" || path.startsWith("/account") },
  ];
  return (
    <nav className={styles.bar} aria-label="پیمایش اصلی">
      {items.map((it) => (
        <Link key={it.label} href={it.href} className={`${styles.item} ${it.active ? styles.active : ""}`} aria-current={it.active ? "page" : undefined}>
          <Icon name={it.icon} size={22} filled={false} />
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
