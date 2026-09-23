import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/current";
import styles from "../panel.module.css";

export const metadata: Metadata = { title: "دسترسی ندارید" };

export default async function ForbiddenPage() {
  await requireStaff();
  return (
    <div className={styles.card} style={{ textAlign: "center", padding: 40 }}>
      <h1 className={styles.pageTitle}>دسترسی ندارید</h1>
      <p className={styles.muted}>نقش شما به این بخش دسترسی ندارد. اگر لازم است، از ادمین بخواهید.</p>
      <Link href="/admin/account">حساب من</Link>
    </div>
  );
}
