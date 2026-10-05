"use client";

import { useSyncExternalStore } from "react";
import { notifyEnabled, setNotify, subscribeNotify } from "../notify-client";
import styles from "../panel.module.css";

// نوار بالای صفحه‌ی «گفتگوها» وقتی اعلان و صدای گفتگو در این مرورگر خاموش است (همان دکمه‌ی پایین منو، ولی جلوی چشم).
export function NotifyBanner() {
  const on = useSyncExternalStore(subscribeNotify, notifyEnabled, () => true);
  if (on) return null;
  return (
    <div className={styles.rateWarn} role="status">
      <span>اعلان و صدای گفتگو در این مرورگر خاموش است؛ پیام و گفتگوی تازه را فقط با باز بودن همین صفحه می‌بینید.</span>
      <button type="button" className={styles.btn} onClick={() => void setNotify(true)}>
        فعال‌سازی اعلان و صدا
      </button>
    </div>
  );
}
