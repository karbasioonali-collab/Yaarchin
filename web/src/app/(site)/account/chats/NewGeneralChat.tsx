"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import s from "@/components/site/site.module.css";
import styles from "../account.module.css";
import f from "../../pages.module.css";

// گفتگوی عمومی تازه (مثلاً درخواست محصولی که روی سایت نیست). مستقیم به صف «ارجاع‌نشده»ی پنل می‌رود.
export function NewGeneralChat() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, message }) });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.conversation?.id) router.push(`/account/chats/${j.conversation.id}`);
      else setError(j?.message ?? "گفتگو ساخته نشد؛ دوباره تلاش کنید.");
    } catch {
      setError("ارتباط برقرار نشد؛ دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className={s.btn} onClick={() => setOpen(true)}>
        گفتگوی تازه با کارشناس
      </button>
    );
  }
  return (
    <form onSubmit={submit} className={`${styles.card} ${styles.cardWide} ${f.form}`}>
      <h2 className={styles.cardTitle}>گفتگوی تازه با کارشناس</h2>
      <p className={styles.cardSub}>برای محصولی که روی سایت نیست یا هر سؤال دیگری. برای سؤال درباره‌ی یک محصول، از صفحه‌ی همان محصول پیام بدهید.</p>
      <label className={f.field}>
        <span className={f.label}>موضوع</span>
        <input className={f.input} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} required minLength={3} placeholder="مثلاً: دستگاه بسته‌بندی پودر" />
      </label>
      <label className={f.field}>
        <span className={f.label}>پیام</span>
        <textarea
          className={f.textarea}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          required
          rows={4}
          placeholder="مشخصات، تعداد تقریبی، عکس یا لینک محصول، …"
        />
      </label>
      {error && (
        <p role="alert" className={f.error}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className={s.btn} disabled={busy}>
          {busy ? "…" : "شروع گفتگو"}
        </button>
        <button type="button" className={s.btnGhost} onClick={() => setOpen(false)}>
          انصراف
        </button>
      </div>
    </form>
  );
}
