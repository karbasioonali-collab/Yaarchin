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
        const active = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
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
