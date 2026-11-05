"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./panel.module.css";

// badge: "chats" ← نشان تعداد گفتگو؛ مقدار اولیه از سرور و به‌روزرسانی از PanelPulse (رویداد yc:chat-count)
export type NavItem = { href: string; label: string; badge?: "chats" };

export function NavLinks({ items, chatCount = 0 }: { items: NavItem[]; chatCount?: number }) {
  const path = usePathname();
  const [count, setCount] = useState(chatCount);
  useEffect(() => {
    const on = (e: Event) => setCount(Number((e as CustomEvent).detail) || 0);
    window.addEventListener("yc:chat-count", on);
    return () => window.removeEventListener("yc:chat-count", on);
  }, []);
  return (
    <nav className={styles.nav}>
      {items.map((it) => {
        // فقط طولانی‌ترین آدرسِ منطبق فعال است (در /admin/ai/costs فقط «هزینه‌ی هوش مصنوعی»، نه «دستیار هوشمند» هم؛ بخش ۵۲)
        const match = (h: string) => (h === "/admin" ? path === "/admin" : path === h || path.startsWith(h + "/"));
        const active = match(it.href) && !items.some((o) => o.href.length > it.href.length && match(o.href));
        return (
          <Link key={it.href} href={it.href} className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}>
            {it.label}
            {it.badge === "chats" && count > 0 && (
              <span className={styles.navBadge} aria-label={`${count.toLocaleString("fa-IR")} مورد تازه`}>
                {count.toLocaleString("fa-IR")}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
