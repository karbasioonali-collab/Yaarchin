import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/can";
import { getAllSettings } from "@/lib/settings";
import { SettingRow } from "./SettingRow";
import styles from "../panel.module.css";

export const metadata: Metadata = { title: "تنظیمات و سوئیچ‌ها" };

const GROUPS: { key: string; title: string; desc: string }[] = [
  { key: "features", title: "سوئیچ بخش‌ها", desc: "هر بخش سایت را می‌شود بدون تغییر کد روشن یا خاموش کرد." },
  { key: "auth", title: "ورود و دسترسی", desc: "" },
  { key: "ai", title: "مدل هوش مصنوعی هر وظیفه", desc: "برای هر وظیفه جدا؛ اتصال واقعی به مدل‌ها در مرحله‌ی چت ساخته می‌شود." },
];

export default async function SettingsPage() {
  await requirePermission("settings.manage");
  const all = await getAllSettings();
  const known = new Set(GROUPS.map((g) => g.key));
  const other = all.filter((s) => !known.has(s.groupKey));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>تنظیمات و سوئیچ‌ها</h1>
          <p className={styles.pageSub}>هر تغییر در لاگ فعالیت با مقدار قبل و بعد ثبت می‌شود.</p>
        </div>
      </div>
      {GROUPS.map((g) => {
        const items = all.filter((s) => s.groupKey === g.key);
        if (!items.length) return null;
        return (
          <div key={g.key} className={styles.card}>
            <h2 className={styles.cardTitle}>{g.title}</h2>
            {g.desc && <p className={styles.muted} style={{ marginTop: -8 }}>{g.desc}</p>}
            {items.map((s) => (
              <SettingRow key={s.key} settingKey={s.key} label={s.labelFa ?? s.key} description={s.description} value={s.value} />
            ))}
          </div>
        );
      })}
      {other.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>سایر</h2>
          {other.map((s) => (
            <SettingRow key={s.key} settingKey={s.key} label={s.labelFa ?? s.key} description={s.description} value={s.value} />
          ))}
        </div>
      )}
    </>
  );
}
