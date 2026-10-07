import Link from "next/link";
import { Logo } from "@/components/Logo";
import { canAny } from "@/lib/auth/can";
import { requireStaff } from "@/lib/auth/current";
import { fmtDate } from "@/lib/format";
import { missingTodayRates } from "@/lib/pricing/admin";
import { RATE_PERMS } from "@/lib/pricing/labels";
import { CHAT_PERMS, chatAccess } from "@/lib/chat/access";
import { chatCounters } from "@/lib/chat/admin";
import { chatReady } from "@/lib/db-ready";
import { isEnabled } from "@/lib/settings";
import { PanelPulse } from "./PanelPulse";
import { logoutAction } from "../(auth)/actions";
import { stopImpersonationAction } from "./users/actions";
import { NavLinks, type NavItem } from "./NavLinks";
import styles from "./panel.module.css";

// permission: یکی از این‌ها کافی است
// feature: فقط وقتی سوئیچ features.<feature> روشن است
const NAV: (NavItem & { permission: string | string[]; feature?: string })[] = [
  { href: "/admin", label: "داشبورد", permission: "dashboard.view" },
  { href: "/admin/users", label: "کاربران", permission: "users.view" },
  { href: "/admin/customers", label: "مشتریان", permission: "customers.view" },
  { href: "/admin/chats", label: "گفتگوها", permission: CHAT_PERMS, badge: "chats" },
  { href: "/admin/inquiries", label: "درخواست‌های مشتری", permission: ["chats.view_all", "chats.assign"] },
  { href: "/admin/reports", label: "گزارش‌ها", permission: "reports.view", feature: "reports" },
  { href: "/admin/roles", label: "نقش‌ها و دسترسی", permission: "roles.manage" },
  { href: "/admin/products", label: "محصولات", permission: ["products.manage", "products.rate"] },
  { href: "/admin/categories", label: "دسته‌بندی‌ها", permission: "categories.manage" },
  { href: "/admin/companies", label: "کارخانه‌ها", permission: "companies.view" },
  { href: "/admin/rates", label: "نرخ‌ها و هزینه‌ها", permission: RATE_PERMS },
  { href: "/admin/site", label: "محتوای سایت", permission: "site.manage" },
  { href: "/admin/messages", label: "پیام‌های تماس", permission: "contact.view" },
  { href: "/admin/activity", label: "لاگ فعالیت", permission: "activity.view" },
  { href: "/admin/sms", label: "پیامک‌های ارسالی", permission: ["settings.manage", "chats.assign"] },
  { href: "/admin/settings", label: "تنظیمات و سوئیچ‌ها", permission: "settings.manage" },
];

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const a = await requireStaff();
  const items: NavItem[] = [];
  for (const n of NAV) {
    if (n.feature && !(await isEnabled(n.feature))) continue;
    if (await canAny(a.user, [n.permission].flat())) items.push({ href: n.href, label: n.label, badge: n.badge });
  }
  // گفتگوها: تعداد اولیه‌ی نشان منو؛ بعد PanelPulse هر چند ثانیه به‌روزش می‌کند
  const chatsOn = items.some((i) => i.badge === "chats") && (await chatReady());
  const chatCount = chatsOn ? (await chatCounters(await chatAccess(a.user))).total : 0;
  // هشدار «نرخ امروز ثبت نشده» برای هر کسی که بخش نرخ‌ها را می‌بیند (سایت تا آن موقع با آخرین نرخ و تاریخش حساب می‌کند)
  const missingRates = (await canAny(a.user, RATE_PERMS)) ? await missingTodayRates() : [];

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Logo size="sm" tagline={false} />
        </div>
        <NavLinks items={items} chatCount={chatCount} />
        {chatsOn && <PanelPulse initialCount={chatCount} />}
        <Link href="/" className={styles.navSoon} target="_blank">
          دیدن سایت ↗
        </Link>
        <div className={styles.navSoon}>آپلود عکس — مرحله‌ی بعد</div>
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
        {missingRates.length > 0 && (
          <div className={styles.rateWarn} role="status">
            <span>
              نرخ امروز {missingRates.map((m) => `${m.nameFa}${m.lastDate ? ` (آخرین: ${fmtDate(m.lastDate)})` : " (هنوز هیچ نرخی)"}`).join("، ")} ثبت نشده؛ سایت با آخرین نرخ ثبت‌شده
              حساب می‌کند.
            </span>
            <Link href="/admin/rates" className={styles.btnGhost}>
              ثبت نرخ
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
