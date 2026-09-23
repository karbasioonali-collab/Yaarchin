import { Logo } from "@/components/Logo";
import styles from "./auth.module.css";

export default function AuthLayout({ children }: LayoutProps<"/admin">) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <Logo size="md" />
        </div>
        {children}
      </div>
    </main>
  );
}
