import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import s from "@/components/site/site.module.css";
import { customerConversations } from "@/lib/chat/customer-list";
import { requireCustomer } from "@/lib/customer/auth";
import { chatReady } from "@/lib/db-ready";
import { isEnabled } from "@/lib/settings";
import styles from "../account.module.css";
import { AccountShell } from "../AccountShell";
import { NewGeneralChat } from "./NewGeneralChat";

export const metadata: Metadata = { title: "گفتگوهای من", robots: { index: false } };

const when = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" });

// «گفتگوهای من»: همه‌ی گفتگوهای مشتری (محصولی و عمومی)، جدیدترین اول، با نشان خوانده‌نشده.
export default async function MyChatsPage() {
  const a = await requireCustomer("/account/chats");
  if (!(await isEnabled("chat")) || !(await chatReady())) notFound();
  const list = await customerConversations(a.user.id);
  return (
    <AccountShell title="گفتگوهای من" name={a.user.fullName}>
      <div style={{ marginBottom: 16 }}>
        <NewGeneralChat />
      </div>
      {list.length ? (
        <div className={styles.chatList}>
          {list.map((c) => (
            <Link key={c.id} href={`/account/chats/${c.id}`} className={styles.chatItem}>
              <div className={styles.chatMain}>
                <div className={styles.chatTitle}>
                  {c.title}
                  {c.kind === "general" && <span className={styles.chip}>عمومی</span>}
                  {c.status === "closed" && <span className={`${styles.chip} ${styles.chipMuted}`}>بسته</span>}
                </div>
                {c.preview && <div className={styles.chatPreview}>{c.preview}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span className={styles.chatMeta}>{when.format(c.lastMessageAt)}</span>
                {c.unread > 0 && (
                  <span className={styles.badge} aria-label={`${c.unread.toLocaleString("fa-IR")} پیام خوانده‌نشده`}>
                    {c.unread.toLocaleString("fa-IR")}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className={`${styles.card} ${styles.empty}`}>
          <strong>هنوز گفتگویی ندارید</strong>
          در صفحه‌ی هر محصول می‌توانید با کارشناس یارچین درباره‌ی همان محصول گفتگو کنید.
          <p>
            <Link href="/categories" className={s.btn}>
              دیدن دسته‌بندی‌ها
            </Link>
          </p>
        </div>
      )}
    </AccountShell>
  );
}
