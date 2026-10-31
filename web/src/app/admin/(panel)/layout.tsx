import Link from "next/link";
import { Logo } from "@/components/Logo";
import { canAny } from "@/lib/auth/can";
import { requireStaff } from "@/lib/auth/current";
import { fmtDate, fmtNum } from "@/lib/format";
import { missingTodayRates } from "@/lib/pricing/admin";
import { RATE_PERMS } from "@/lib/pricing/labels";
import { CHAT_PERMS, chatAccess } from "@/lib/chat/access";
import { chatCounters } from "@/lib/chat/admin";
import { chatReady } from "@/lib/db-ready";
import { isEnabled } from "@/lib/settings";
import { aiReady, aiTestsReady, importReady } from "@/lib/db-ready";
import { DB_IMAGES_WARN_BYTES, dbImageBytes } from "@/lib/import/service";
import { staleWarning } from "@/lib/ai/tests";
import { overdueCount } from "@/lib/ai/kb";
import { costWarning } from "@/lib/ai/usage";
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
  { href: "/admin/ai", label: "دستیار هوشمند", permission: "ai.settings" },
  { href: "/admin/ai/knowledge", label: "پایگاه دانش دستیار", permission: "ai.knowledge" },
  { href: "/admin/ai/tests", label: "آزمون دستیار", permission: "ai.tests" },
  { href: "/admin/ai/suggestions", label: "پیشنهاد سؤال تازه", permission: ["ai.knowledge", "ai.tests"] },
  { href: "/admin/roles", label: "نقش‌ها و دسترسی", permission: "roles.manage" },
  { href: "/admin/products", label: "محصولات", permission: ["products.manage", "products.rate"] },
  { href: "/admin/import", label: "ورود از علی‌بابا", permission: "catalog.import" },
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
  // دستیار هوشمند: هشدار ۸۰٪ سقف هزینه‌ی روزانه (ai.settings) و موردهای پایگاه دانشِ نیازمند بررسی مجدد (ai.knowledge)
  const aiOn = await aiReady();
  const aiCostWarn = aiOn && (await canAny(a.user, ["ai.settings"])) ? await costWarning() : null;
  const kbOverdue = aiOn && (await canAny(a.user, ["ai.knowledge"])) ? await overdueCount() : 0;
  // آزمون دستیار (ai.tests): آزمون کامل بیش از ai.test_stale_days روز اجرا نشده، یا مدل/دستورالعمل بعد از آن عوض شده
  const testWarn = (await aiTestsReady()) && (await canAny(a.user, ["ai.tests"])) ? await staleWarning() : null;
  // ورود از علی‌بابا: عکس‌های داخل دیتابیس از ۱ گیگابایت گذشت ← وقت فضای ابری (docs/infoyaarchin.md بخش ۳۶)
  const importImgBytes = (await importReady()) && (await canAny(a.user, ["catalog.import"])) ? await dbImageBytes() : 0;

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
              <button type="submit" className={styles.linkButton}>
                خروج
              </button>
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
              <button type="submit" className={styles.btnGhost}>
                پایان
              </button>
            </form>
          </div>
        )}
        {missingRates.length > 0 && (
          <div className={styles.rateWarn} role="status">
            <span>
              نرخ امروز {missingRates.map((m) => `${m.nameFa}${m.lastDate ? ` (آخرین: ${fmtDate(m.lastDate)})` : " (هنوز هیچ نرخی)"}`).join("، ")} ثبت نشده؛ سایت با آخرین نرخ
              ثبت‌شده حساب می‌کند.
            </span>
            <Link href="/admin/rates" className={styles.btnGhost}>
              ثبت نرخ
            </Link>
          </div>
        )}
        {aiCostWarn && (
          <div className={styles.rateWarn} role="status">
            <span>
              دستیار هوشمند امروز {fmtNum(aiCostWarn.pct)}٪ سقف هزینه‌ی روزانه را مصرف کرده ({fmtNum(Math.round(aiCostWarn.cost))} از {fmtNum(aiCostWarn.cap)} تومان). با رسیدن به
              سقف، تا فردا چت‌ها مستقیم به کارشناس می‌روند.
            </span>
            <Link href="/admin/ai" className={styles.btnGhost}>
              دستیار هوشمند
            </Link>
          </div>
        )}
        {kbOverdue > 0 && (
          <div className={styles.rateWarn} role="status">
            <span>{fmtNum(kbOverdue)} مورد پایگاه دانش دستیار بیش از بازه‌ی تنظیم‌شده بررسی نشده‌اند.</span>
            <Link href="/admin/ai/knowledge?filter=overdue" className={styles.btnGhost}>
              فهرست موردها
            </Link>
          </div>
        )}
        {importImgBytes >= DB_IMAGES_WARN_BYTES && (
          <div className={styles.rateWarn} role="status">
            <span>عکس‌های «ورود از علی‌بابا» در دیتابیس از ۱ گیگابایت گذشته ({fmtNum(Math.round(importImgBytes / 1024 / 1024))} مگابایت)؛ وقت راه‌اندازی فضای ابری (S3) است.</span>
            <Link href="/admin/import" className={styles.btnGhost}>
              ورود از علی‌بابا
            </Link>
          </div>
        )}
        {testWarn && (
          <div className={styles.rateWarn} role="status">
            <span>
              {testWarn.kind === "never"
                ? "آزمون کامل دستیار هنوز اجرا نشده."
                : testWarn.kind === "changed"
                  ? "مدل یا دستورالعمل دستیار بعد از آخرین آزمون کامل عوض شده؛ آزمون را دوباره اجرا کنید."
                  : `آزمون کامل دستیار بیش از ${fmtNum(testWarn.days)} روز است اجرا نشده.`}
            </span>
            <Link href="/admin/ai/tests" className={styles.btnGhost}>
              آزمون دستیار
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
