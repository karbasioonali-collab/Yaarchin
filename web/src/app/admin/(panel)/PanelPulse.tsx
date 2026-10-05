"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { beep, notifyEnabled, setNotify, subscribeNotify, unlockAudio } from "./notify-client";
import styles from "./panel.module.css";

// «نبض» پنل: هر ۱۵ ثانیه (پس‌زمینه ۴۵ ثانیه) از /admin/pulse می‌پرسد چه خبر است.
//   - تعداد (پیام‌های خوانده‌نشده‌ی گفتگوهای من + گفتگوهای ارجاع‌نشده) ← نشان منو (رویداد yc:chat-count) و عنوان تب «(۳) …»
//   - رویداد تازه (چت جدید، ارجاع به من، پیام جدید در چت من) ← اعلان مرورگر + صدای کوتاه
// مرورگرها اعلان و صدا را فقط بعد از اجازه/کلیک کاربر می‌دهند؛ دکمه‌ی «اعلان‌ها» یک بار زده می‌شود (در localStorage می‌ماند).
// صدا با WebAudio ساخته می‌شود (فایل صوتی لازم نیست). docs/infoyaarchin.md بخش ۲۴.
const VISIBLE_MS = 15000;
const HIDDEN_MS = 45000;
type Ev = { id: number; type: "new_chat" | "assigned_to_me" | "new_message"; conversationId: string; text: string };
const TITLE: Record<Ev["type"], string> = { new_chat: "گفتگوی تازه", assigned_to_me: "ارجاع به شما", new_message: "پیام تازه" };

const fa = (n: number) => n.toLocaleString("fa-IR");
const stripCount = (t: string) => t.replace(/^\([۰-۹0-9]+\)\s/, "");

export function PanelPulse({ initialCount }: { initialCount: number }) {
  const router = useRouter();
  const path = usePathname();
  const on = useSyncExternalStore(subscribeNotify, notifyEnabled, () => false);
  const countRef = useRef(initialCount);
  const cursorRef = useRef(0);
  const onRef = useRef(false);

  const applyTitle = () => {
    const base = stripCount(document.title);
    document.title = countRef.current > 0 ? `(${fa(countRef.current)}) ${base}` : base;
  };

  useEffect(() => {
    onRef.current = on;
  }, [on]);

  useEffect(() => {
    // هر کلیک کاربر، صدای قفل‌شده را آزاد می‌کند (سیاست autoplay مرورگرها)
    const unlock = () => onRef.current && unlockAudio();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // عنوان هر صفحه را Next عوض می‌کند؛ بعد از هر ناوبری دوباره پیشوند تعداد را می‌گذاریم
  useEffect(() => {
    const t = setTimeout(applyTitle, 50);
    return () => clearTimeout(t);
  }, [path]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch(`/admin/pulse?cursor=${cursorRef.current}`, { cache: "no-store" });
        if (r.ok && r.headers.get("content-type")?.includes("json")) {
          const j = (await r.json()) as { counters: { total: number }; cursor: number; events: Ev[] };
          if (stop) return;
          const changed = j.counters.total !== countRef.current;
          countRef.current = j.counters.total;
          window.dispatchEvent(new CustomEvent("yc:chat-count", { detail: j.counters.total }));
          applyTitle();
          if (j.events.length && onRef.current) {
            beep();
            if ("Notification" in window && Notification.permission === "granted") {
              for (const e of j.events.slice(-3)) {
                const n = new Notification(`یارچین — ${TITLE[e.type]}`, { body: e.text, tag: `yc-${e.conversationId}`, icon: "/icon.png" });
                n.onclick = () => {
                  window.focus();
                  router.push(`/admin/chats/${e.conversationId}`);
                  n.close();
                };
              }
            }
          }
          // صفحه‌ی فهرست گفتگوها با رویداد تازه به‌روز می‌شود
          if ((j.events.length || changed) && cursorRef.current && path === "/admin/chats") router.refresh();
          cursorRef.current = j.cursor;
        }
      } catch {
        /* دور بعد */
      }
      if (!stop) timer = setTimeout(tick, document.visibilityState === "visible" ? VISIBLE_MS : HIDDEN_MS);
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [path, router]);

  async function toggle() {
    onRef.current = !on;
    await setNotify(!on);
  }

  const denied = typeof window !== "undefined" && "Notification" in window && Notification.permission === "denied";
  return (
    <button
      type="button"
      className={styles.notifyBtn}
      onClick={toggle}
      aria-pressed={on}
      title={denied ? "اجازه‌ی اعلان در تنظیمات مرورگر بسته است؛ فقط صدا پخش می‌شود." : undefined}
    >
      {on ? "🔔 اعلان و صدای گفتگو: روشن" : "🔕 اعلان و صدای گفتگو: خاموش (بزنید)"}
    </button>
  );
}
