import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { siteUrl } from "@/lib/site/url";
import "./globals.css";

// وزیرمتن محلی (OFL)، بدون CDN.
const vazirmatn = localFont({
  src: "./fonts/Vazirmatn-Variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-vazirmatn",
});

// metadataBase از SITE_URL (lib/site/url.ts): آدرس مطلق عکس اشتراک‌گذاری (openGraph) و canonical با همین ساخته می‌شود.
// تابع است نه ثابت، تا SITE_URL هنگام اجرا خوانده شود (لیارا متغیرها را به برنامه‌ی در حال اجرا می‌دهد، نه لزوماً به build).
export function generateMetadata(): Metadata {
  const base = siteUrl();
  return {
    ...(base ? { metadataBase: new URL(base) } : {}),
    title: { default: "یارچین — پل واردات از چین به ایران", template: "%s | یارچین" },
    description: "قیمت و مشخصات هر محصول از چند کارخانه‌ی چینی، کنار هم؛ با همراهی کارشناس تا رسیدن کالا به ایران.",
    applicationName: "یارچین",
  };
}

// آماده‌سازی PWA: رنگ نوار مرورگر و استفاده از کل صفحه در گوشی‌های دارای ناچ (safe-area در CSS رعایت شده)
export const viewport: Viewport = {
  themeColor: "#2F7D5C",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body>{children}</body>
    </html>
  );
}
