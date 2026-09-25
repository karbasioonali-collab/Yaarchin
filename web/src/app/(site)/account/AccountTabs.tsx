"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/site/Icon";
import { ACCOUNT_TABS } from "@/lib/customer/nav";
import styles from "./account.module.css";

export function AccountTabs() {
  const path = usePathname();
  return (
    <nav className={styles.tabs} aria-label="بخش‌های حساب">
      {ACCOUNT_TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link key={t.href} href={t.href} className={`${styles.tab} ${active ? styles.tabActive : ""}`} aria-current={active ? "page" : undefined}>
            <Icon name={t.icon} size={18} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
