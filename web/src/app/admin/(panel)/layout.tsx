import Link from "next/link";
import { Logo } from "@/components/Logo";
import { can } from "@/lib/auth/can";
import { requireStaff } from "@/lib/auth/current";
import { logoutAction } from "../(auth)/actions";
import { stopImpersonationAction } from "./users/actions";
import { NavLinks, type NavItem } from "./NavLinks";
import styles from "./panel.module.css";

const NAV: (NavItem & { permission: string })[] = [
  { href: "/admin", label: "داشبورد", permission: "dashboard.view" },
  { href: "/admin/users", label: "کاربران", permission: "users.view" },
  { href: "/admin/roles", label: "نقش‌ها و دسترسی", permission: "roles.manage" },
  { href: "/admin/products", label: "محصولات", permission: "products.rate" },
  { href: "/admin/site", label: "محتوای سایت", permission: "site.manage" },
  { href: "/admin/messages", label: "پیام‌های تماس", permission: "contact.view" },
  { href: "/admin/activity", label: "لاگ فعالیت", permission: "activity.view" },
  { href: "/admin/settings", label: "تنظیمات و سوئیچ‌ها", permission: "settings.manage" },
];

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const a = await requireStaff();
  const items: NavItem[] = [];
  for (const n of NAV) if (await can(a.user, n.permission)) items.push({ href: n.href, label: n.label });

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Logo size="sm" tagline={false} />
        </div>
        <NavLinks items={items} />
        <Link href="/" className={styles.navSoon} target="_blank">
          دیدن سایت ↗
        </Link>
        <div className={styles.navSoon}>مدیریت کامل محصول، شرکت‌ها، دسته‌بندی، چت‌ها، نرخ‌ها — مرحله‌های بعد</div>
        <div className={styles.userBox}>
          <div>
            <div className={styles.userName}>{a.user.fullName}</div>
            <div className={styles.userRole}>{a.user.roles.map((r) => r.nameFa).join("، ")}</div>
          </div>
          <div className={styles.userActions}>
            <Link href="/admin/account">حساب من</Link>
            <form action={logoutAction}>
              <button type="submit" className={styles.linkButton}>خروج</button>
            </form>
          </div>
        </div>
      </aside>
      <main className={styles.main}>
        {a.impersonating && (
          <div className={styles.impersonation}>
            <span>
              در حال دیدن سایت به‌جای <strong>{a.impersonating.fullName}</strong>
            </span>
            <form action={stopImpersonationAction}>
              <button type="submit" className={styles.btnGhost}>پایان</button>
            </form>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
