"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import styles from "./LoginPrompt.module.css";
import s from "./site.module.css";

// پنجره‌ی «برای این کار باید وارد شوید». وقتی API جواب 401 بدهد باز می‌شود (قانون دسترسی در سرور اعمال می‌شود).
export function LoginPrompt({ open, onClose, text }: { open: boolean; onClose: () => void; text: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const path = usePathname();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()} aria-labelledby="login-prompt-title">
      <div className={styles.body}>
        <div className={styles.icon}>
          <Icon name="user" size={28} />
        </div>
        <h2 id="login-prompt-title" className={styles.title}>
          برای این کار باید وارد شوید
        </h2>
        <p className={styles.text}>{text}</p>
        <div className={styles.actions}>
          <Link href={`/login?next=${encodeURIComponent(path)}`} className={s.btn}>
            ورود / ثبت‌نام
          </Link>
          <button type="button" className={s.btnGhost} onClick={onClose}>
            بعداً
          </button>
        </div>
      </div>
    </dialog>
  );
}

// پیام کوتاه پایین صفحه
export function Toast({ text, onDone }: { text: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [text, onDone]);
  if (!text) return null;
  return (
    <div className={styles.toast} role="status">
      {text}
    </div>
  );
}

export type ApiOutcome = "ok" | "login" | "forbidden" | "soon" | "error";

// نتیجه‌ی درخواست‌هایی که ورود لازم دارند
export async function callProtected(url: string, body: unknown, method: "POST" | "DELETE" = "POST"): Promise<ApiOutcome> {
  try {
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) return "ok";
    if (r.status === 401) return "login";
    if (r.status === 403) return "forbidden";
    if (r.status === 501 || r.status === 503) return "soon";
    return "error";
  } catch {
    return "error";
  }
}
