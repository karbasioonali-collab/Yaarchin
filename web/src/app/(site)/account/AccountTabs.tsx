"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/site/Icon";
import type { AccountTab } from "@/lib/customer/nav";
import styles from "./account.module.css";

export function AccountTabs({ tabs }: { tabs: (AccountTab & { badge: number })[] }) {
  const path = usePathname();
  return (
    <nav className={styles.tabs} aria-label="بخش‌های حساب">
      {tabs.map((t) => {
        const active = t.href === "/account" ? path === t.href : path === t.href || path.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href} className={`${styles.tab} ${active ? styles.tabActive : ""}`} aria-current={active ? "page" : undefined}>
            <Icon name={t.icon} size={18} />
            {t.label}
            {t.badge > 0 && (
              <span className={styles.badge} aria-label={`${t.badge.toLocaleString("fa-IR")} پیام خوانده‌نشده`}>
                {t.badge.toLocaleString("fa-IR")}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
