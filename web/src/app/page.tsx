import { Logo } from "@/components/Logo";

// صفحه‌ی موقت تا مرحله‌ی ۴ (سایت عمومی).
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        textAlign: "center",
      }}
    >
      <div>
        <Logo size="lg" />
        <p style={{ color: "var(--muted)", marginTop: 24 }}>به‌زودی</p>
      </div>
    </main>
  );
}
