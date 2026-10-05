import type { ReactNode } from "react";
import s from "@/components/site/site.module.css";
import { customerUnreadTotal } from "@/lib/chat/service";
import { getCustomer } from "@/lib/customer/auth";
import { ACCOUNT_TABS } from "@/lib/customer/nav";
import { chatReady } from "@/lib/db-ready";
import { isEnabled } from "@/lib/settings";
import { AccountTabs } from "./AccountTabs";
import styles from "./account.module.css";

// قاب مشترک پنل مشتری: عنوان + تب‌ها (lib/customer/nav.ts). /favorites هم از همین استفاده می‌کند.
// تب «گفتگوهای من» فقط با سوئیچ features.chat و بعد از migration ۰۰۰۶، با نشان تعداد پیام خوانده‌نشده.
export async function AccountShell({ title, name, children }: { title: string; name: string; children: ReactNode }) {
  const chatOn = (await isEnabled("chat")) && (await chatReady());
  const me = chatOn ? await getCustomer() : null;
  const unread = me ? await customerUnreadTotal(me.user.id) : 0;
  const tabs = ACCOUNT_TABS.filter((t) => t.feature !== "chat" || chatOn).map((t) => ({ ...t, badge: t.href === "/account/chats" ? unread : 0 }));
  return (
    <div className={s.container}>
      <div className={styles.head}>
        <p className={styles.hello}>سلام {name.split(" ")[0]}</p>
        <h1 className={styles.title}>{title}</h1>
      </div>
      <AccountTabs tabs={tabs} />
      <div className={styles.body}>{children}</div>
    </div>
  );
}
