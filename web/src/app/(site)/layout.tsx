import { Logo } from "@/components/Logo";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { MobileTabBar } from "@/components/site/MobileTabBar";
import s from "@/components/site/site.module.css";
import { getAuth } from "@/lib/auth/current";
import { getCategoryTree, latestProductLinks } from "@/lib/catalog/public";
import { getBlock } from "@/lib/site/get";
import { isEnabled } from "@/lib/settings";

// قالب سایت عمومی: هدر، فوتر و نوار پایین موبایل. محتوای هدر/فوتر از پنل (محتوای سایت) می‌آید.
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const [header, footer, categories, siteOn, favoritesOn] = await Promise.all([
    getBlock("header"),
    getBlock("footer"),
    getCategoryTree(),
    isEnabled("public_site"),
    isEnabled("favorites"),
  ]);

  // سوئیچ «سایت عمومی» خاموش: فقط کاربران پنل سایت را می‌بینند
  if (!siteOn && !(await getAuth())?.user.isStaff) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16, textAlign: "center" }}>
        <div>
          <Logo size="lg" />
          <p style={{ color: "var(--muted)", marginTop: 24 }}>به‌زودی</p>
        </div>
      </main>
    );
  }

  const products = footer.isVisible && footer.data.products.visible ? await latestProductLinks(footer.data.products.limit) : [];

  return (
    <>
      <Header data={header.data} categories={categories} favoritesEnabled={favoritesOn} />
      <main className={s.main}>{children}</main>
      {footer.isVisible && <Footer data={footer.data} categories={categories} products={products} />}
      <div className={s.tabSpacer} aria-hidden="true" />
      <MobileTabBar favoritesEnabled={favoritesOn} />
    </>
  );
}
