import { Logo } from "@/components/Logo";
import { Footer } from "@/components/site/Footer";
import { Header, type Viewer } from "@/components/site/Header";
import { MobileTabBar } from "@/components/site/MobileTabBar";
import { Tracker } from "@/components/site/Tracker";
import s from "@/components/site/site.module.css";
import { getAuth } from "@/lib/auth/current";
import { getCategoryTree, latestProductLinks } from "@/lib/catalog/public";
import { isCustomer } from "@/lib/customer/auth";
import { getBlock } from "@/lib/site/get";
import { isEnabled } from "@/lib/settings";

// قالب سایت عمومی: هدر، فوتر و نوار پایین موبایل. محتوای هدر/فوتر از پنل (محتوای سایت) می‌آید.
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const [header, footer, categories, siteOn, favoritesOn, auth] = await Promise.all([
    getBlock("header"),
    getBlock("footer"),
    getCategoryTree(),
    isEnabled("public_site"),
    isEnabled("favorites"),
    getAuth(),
  ]);

  // سوئیچ «سایت عمومی» خاموش: فقط کاربران پنل سایت را می‌بینند
  if (!siteOn && !auth?.user.isStaff) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16, textAlign: "center" }}>
        <div>
          <Logo size="lg" />
          <p style={{ color: "var(--muted)", marginTop: 24 }}>به‌زودی</p>
        </div>
      </main>
    );
  }

  // چه کسی وارد شده: مشتری (لینک «حساب من» و ثبت رفتار)، کارمند (لینک پنل) یا هیچ‌کس
  const viewer: Viewer = auth && isCustomer(auth.user) ? { kind: "customer", name: auth.user.fullName } : auth?.user.isStaff ? { kind: "staff" } : null;
  const products = footer.isVisible && footer.data.products.visible ? await latestProductLinks(footer.data.products.limit) : [];

  return (
    <>
      <Header data={header.data} categories={categories} favoritesEnabled={favoritesOn} viewer={viewer} />
      <main className={s.main}>{children}</main>
      {footer.isVisible && <Footer data={footer.data} categories={categories} products={products} />}
      <div className={s.tabSpacer} aria-hidden="true" />
      <MobileTabBar favoritesEnabled={favoritesOn} customer={viewer?.kind === "customer"} />
      {viewer?.kind === "customer" && <Tracker />}
    </>
  );
}
