import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// وزیرمتن محلی (OFL)، بدون CDN.
const vazirmatn = localFont({
  src: "./fonts/Vazirmatn-Variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-vazirmatn",
});

export const metadata: Metadata = {
  title: { default: "یارچین", template: "%s | یارچین" },
  description: "پل واردات از چین به ایران",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body>{children}</body>
    </html>
  );
}
