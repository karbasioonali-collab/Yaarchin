"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../panel.module.css";

const TABS = [
  { href: "/admin/rates", label: "ارزها" },
  { href: "/admin/rates/shipping", label: "روش‌های حمل" },
  { href: "/admin/rates/costs", label: "بیمه و هزینه‌ها" },
  { href: "/admin/rates/hs", label: "HS code و حقوق ورودی" },
  { href: "/admin/rates/tax", label: "ارزش افزوده و نرخ گمرکی" },
  { href: "/admin/rates/calculator", label: "ماشین‌حساب آزمایشی" },
  { href: "/admin/rates/missing", label: "محصولات با اطلاعات ناقص" },
];

export function RatesTabs() {
  const path = usePathname();
  return (
    <nav className={styles.tabs} aria-label="بخش‌های نرخ‌ها و هزینه‌ها">
      {TABS.map((t) => {
        const active = t.href === "/admin/rates" ? path === t.href : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={`${styles.tab} ${active ? styles.tabActive : ""}`} aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
