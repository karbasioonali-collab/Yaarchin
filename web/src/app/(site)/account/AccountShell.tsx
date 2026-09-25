import type { ReactNode } from "react";
import s from "@/components/site/site.module.css";
import { AccountTabs } from "./AccountTabs";
import styles from "./account.module.css";

// قاب مشترک پنل مشتری: عنوان + تب‌ها (lib/customer/nav.ts). /favorites هم از همین استفاده می‌کند.
export function AccountShell({ title, name, children }: { title: string; name: string; children: ReactNode }) {
  return (
    <div className={s.container}>
      <div className={styles.head}>
        <p className={styles.hello}>سلام {name.split(" ")[0]}</p>
        <h1 className={styles.title}>{title}</h1>
      </div>
      <AccountTabs />
      <div className={styles.body}>{children}</div>
    </div>
  );
}
