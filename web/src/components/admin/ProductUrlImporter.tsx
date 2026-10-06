"use client";
// وارد کردن عکس محصول از لینک (هر خط یک لینک). سایت خودش هر عکس را دانلود، بررسی و پردازش می‌کند (/api/admin/media/import).
// لینک‌ها یکی‌یکی فرستاده می‌شوند و هر کدام نتیجه‌ی خودش را دارد. عکس واردشده «منتشر نشود» ثبت می‌شود تا بررسی شود.
import { useRouter } from "next/navigation";
import { useState } from "react";
import ui from "@/components/ui/ui.module.css";
import styles from "./media.module.css";

type Row = { url: string; state: "wait" | "busy" | "added" | "duplicate" | "error"; error?: string };
const LABEL: Record<Row["state"], string> = { wait: "در صف", busy: "در حال دانلود…", added: "✓ وارد شد (منتشر نشود)", duplicate: "تکراری؛ قبلاً هست", error: "" };

export function ProductUrlImporter(props: { productId: string; batchMax: number; listings: { id: string; label: string }[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [listingId, setListingId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    let urls = Array.from(
      new Set(
        text
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
    setNote(null);
    if (!urls.length) return setNote("حداقل یک لینک بدهید.");
    if (urls.length > props.batchMax) {
      setNote(`حداکثر ${props.batchMax.toLocaleString("fa-IR")} لینک در هر بار؛ فقط لینک‌های اول وارد می‌شوند.`);
      urls = urls.slice(0, props.batchMax);
    }
    setBusy(true);
    setRows(urls.map((url) => ({ url, state: "wait" })));
    let changed = 0;
    for (const [i, url] of urls.entries()) {
      const set = (p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
      set({ state: "busy" });
      try {
        const res = await fetch("/api/admin/media/import", {
          method: "POST",
          headers: { "content-type": "application/json", "x-yc-upload": "1" },
          body: JSON.stringify({ productId: props.productId, url, listingId: listingId || undefined }),
        });
        const j = (await res.json().catch(() => ({ ok: false, error: `خطای سرور (${res.status}).` }))) as { ok: boolean; status?: "added" | "duplicate"; error?: string };
        if (j.ok && j.status) {
          set({ state: j.status });
          if (j.status === "added") changed++;
        } else set({ state: "error", error: j.error ?? `خطا (${res.status})` });
      } catch {
        set({ state: "error", error: "ارتباط قطع شد." });
      }
    }
    setBusy(false);
    if (changed) {
      setText("");
      router.refresh();
    }
  }

  return (
    <div className={styles.uploader}>
      <label className={ui.field}>
        <span className={ui.label}>لینک عکس‌ها (هر خط یک لینک https)</span>
        <textarea
          className={`${ui.textarea} ${ui.ltr}`}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://sc04.alicdn.com/kf/….jpg"
          disabled={busy}
          aria-label="لینک عکس‌ها"
        />
      </label>
      <div className={styles.pickRow}>
        {props.listings.length > 0 && (
          <select
            className={ui.select}
            style={{ width: "auto" }}
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            disabled={busy}
            aria-label="از لیستینگ کدام کارخانه"
          >
            <option value="">از کدام کارخانه (اختیاری)</option>
            {props.listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        )}
        <button type="button" className={ui.secondary} onClick={() => void run()} disabled={busy}>
          {busy ? "در حال وارد کردن…" : "وارد کردن از لینک"}
        </button>
      </div>
      <span className={styles.status} style={{ color: "var(--muted)" }}>
        سایت خودش عکس را دانلود، کوچک و WebP می‌کند و اطلاعات داخل فایل را پاک می‌کند. عکس‌های واردشده <strong>«منتشر نشود»</strong> ثبت می‌شوند؛ بعد از بررسی (لوگو یا اسم کارخانه
        نداشته باشد) «انتشار» را بزنید. عکس تکراری دوباره ذخیره نمی‌شود.
      </span>
      {note && <span className={styles.statusErr}>{note}</span>}
      {rows.length > 0 && (
        <ul className={styles.list} aria-live="polite">
          {rows.map((r, i) => (
            <li key={i} className={styles.item}>
              <span className={styles.name}>{r.url}</span>
              <span className={r.state === "error" ? styles.statusErr : r.state === "added" ? styles.statusOk : styles.status}>
                {r.state === "error" ? r.error : LABEL[r.state]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
