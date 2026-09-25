import Link from "next/link";
import { Logo } from "@/components/Logo";

// آدرس‌هایی که هیچ صفحه‌ای ندارند (بیرون از قالب سایت)
export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16, textAlign: "center" }}>
      <div>
        <Logo size="lg" />
        <h1 style={{ fontSize: 22, color: "var(--green-dark)", margin: "28px 0 8px" }}>صفحه پیدا نشد</h1>
        <Link href="/">بازگشت به صفحه‌ی اصلی</Link>
      </div>
    </main>
  );
}
