import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/ActionForm";
import ui from "@/components/ui/ui.module.css";
import { requireAnyPermission } from "@/lib/auth/can";
import { CHAT_PERMS, chatAccess } from "@/lib/chat/access";
import { getSetting } from "@/lib/settings";
import styles from "../../panel.module.css";
import { Checkbox, Field } from "@/components/ui/Field";
import { smsRules } from "@/lib/chat/alerts";
import { followupReady } from "@/lib/db-ready";
import { smsProviderName } from "@/lib/sms";
import { saveAutoReplyAction, saveSmsRulesAction } from "../actions";

// شماره‌ی روزها مثل Date.getDay در ساعت تهران: ۰ یکشنبه … ۶ شنبه؛ به ترتیب هفته‌ی ایرانی نمایش داده می‌شوند
const WEEK: [number, string][] = [
  [6, "شنبه"],
  [0, "یکشنبه"],
  [1, "دوشنبه"],
  [2, "سه‌شنبه"],
  [3, "چهارشنبه"],
  [4, "پنجشنبه"],
  [5, "جمعه"],
];

export const metadata: Metadata = { title: "تنظیمات گفتگو" };

// متن پیام خودکار (تنظیم chat.auto_reply). فقط با chats.assign (ادمین همیشه). روشن/خاموش کل چت: سوئیچ features.chat.
export default async function ChatSettingsPage() {
  const a = await requireAnyPermission(CHAT_PERMS);
  if (!(await chatAccess(a.user)).assign) notFound();
  const text = (await getSetting<string>("chat.auto_reply")) ?? "";
  const smsOn = await followupReady();
  const rules = await smsRules();
  const provider = smsProviderName();
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

      {smsOn && (
        <div className={styles.card} style={{ maxWidth: 640 }}>
          <h2 className={styles.cardTitle}>پیامک هشدار</h2>
          <p className={styles.muted} style={{ marginTop: -6, fontSize: 13 }}>
            {provider ? (
              <>
                سرویس پیامک: <span className={styles.mono}>{provider}</span>
              </>
            ) : (
              <>
                <span className={`${styles.badge} ${styles.badgeWarn}`}>حالت آزمایشی</span> سرویس پیامک وصل نیست؛ پیامک‌ها فقط در{" "}
                <Link href="/admin/sms">«پیامک‌های ارسالی»</Link> ثبت می‌شوند. با تنظیم SMS_PROVIDER و کلیدش در لیارا، بدون تغییر کد واقعی می‌شوند.
              </>
            )}
          </p>
          <ActionForm action={saveSmsRulesAction} submitLabel="ذخیره">
            <div className={styles.row}>
              <Field label="فاصله‌ی بین دو پیامک برای یک گفتگو (دقیقه)" name="cooldown" defaultValue={String(rules.cooldownMin)} inputMode="numeric" ltr required />
              <Field label="یادآوری پیام بی‌پاسخ بعد از (دقیقه)" name="reminder" defaultValue={String(rules.reminderMin)} inputMode="numeric" ltr required />
            </div>
            <div className={styles.row}>
              <Field label="شروع ساعت کاری (تهران)" name="workStart" type="time" defaultValue={rules.workStart} ltr required />
              <Field label="پایان ساعت کاری" name="workEnd" type="time" defaultValue={rules.workEnd} ltr required />
            </div>
            <fieldset className={styles.iconPicker}>
              <legend className={ui.label}>روزهای کاری</legend>
              <div className={styles.checkRow}>
                {WEEK.map(([d, n]) => (
                  <Checkbox key={d} label={n} name="workDays" value={String(d)} defaultChecked={rules.workDays.includes(d)} />
                ))}
              </div>
            </fieldset>
            <p className={ui.hint} style={{ margin: 0 }}>
              خارج از ساعت و روز کاری پیامک فرستاده نمی‌شود (یادآوری‌ها با شروع ساعت کاری فرستاده می‌شوند). هر کارمند در «حساب من» می‌تواند پیامک را برای خودش خاموش کند.
            </p>
          </ActionForm>
        </div>
      )}
    </>
  );
}
