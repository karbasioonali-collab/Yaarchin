import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/ActionForm";
import ui from "@/components/ui/ui.module.css";
import { requireAnyPermission } from "@/lib/auth/can";
import { CHAT_PERMS, chatAccess } from "@/lib/chat/access";
import { getSetting } from "@/lib/settings";
import styles from "../../panel.module.css";
import { saveAutoReplyAction } from "../actions";

export const metadata: Metadata = { title: "تنظیمات گفتگو" };

// متن پیام خودکار (تنظیم chat.auto_reply). فقط با chats.assign (ادمین همیشه). روشن/خاموش کل چت: سوئیچ features.chat.
export default async function ChatSettingsPage() {
  const a = await requireAnyPermission(CHAT_PERMS);
  if (!(await chatAccess(a.user)).assign) notFound();
  const text = (await getSetting<string>("chat.auto_reply")) ?? "";
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>تنظیمات گفتگو</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/chats">گفتگوها</Link> · روشن/خاموش کردن کل چت در «تنظیمات و سوئیچ‌ها» ← «چت مشتری» است.
          </p>
        </div>
      </div>
      <div className={styles.card} style={{ maxWidth: 640 }}>
        <h2 className={styles.cardTitle}>پیام خودکار</h2>
        <ActionForm action={saveAutoReplyAction} submitLabel="ذخیره">
          <label className={ui.field}>
            <span className={ui.label}>بعد از اولین پیام مشتری در هر گفتگو فرستاده می‌شود</span>
            <textarea name="text" defaultValue={text} className={ui.textarea} maxLength={1000} rows={4} />
            <span className={ui.hint}>خالی بگذارید تا پیام خودکار فرستاده نشود. تغییر روی گفتگوهای تازه اثر دارد.</span>
          </label>
        </ActionForm>
      </div>
    </>
  );
}
