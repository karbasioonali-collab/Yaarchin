"use client";
// آپلود چند عکس (و ویدیو) برای یک محصول: انتخاب از کامپیوتر/گالری، دوربین گوشی، یا کشیدن و رها کردن.
// فایل‌ها یکی‌یکی فرستاده می‌شوند (حافظه‌ی سرور در پلن رایگان کم است) و هر کدام نوار پیشرفت و نتیجه‌ی خودش را دارد.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Checkbox } from "@/components/ui/Field";
import styles from "./media.module.css";
import { IMAGE_ACCEPT, uploadFile, VIDEO_ACCEPT } from "./upload-client";

type Row = { name: string; progress: number; error?: string; done?: boolean };

export function ProductMediaUploader(props: { productId: string; batchMax: number; imageMaxMb: number; videoMaxMb: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [hasLogo, setHasLogo] = useState(false);
  const [drag, setDrag] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function send(list: File[]) {
    if (!list.length || busy) return;
    setNote(null);
    let files = list;
    if (files.length > props.batchMax) {
      setNote(`حداکثر ${props.batchMax.toLocaleString("fa-IR")} فایل در هر بار؛ فقط ${props.batchMax.toLocaleString("fa-IR")} فایل اول فرستاده می‌شود.`);
      files = files.slice(0, props.batchMax);
    }
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, progress: 0 })));
    let okCount = 0;
    for (const [i, f] of files.entries()) {
      const set = (p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
      const r = await uploadFile(f, { purpose: "product", productId: props.productId, ...(hasLogo ? { hasLogo: "1" } : {}) }, (x) => set({ progress: x }));
      if (r.ok) {
        okCount++;
        set({ progress: 1, done: true });
      } else set({ error: r.error });
    }
    setBusy(false);
    if (okCount) router.refresh();
  }

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []);
    e.target.value = "";
    void send(fs);
  };

  return (
    <div
      className={`${styles.uploader} ${drag ? styles.uploaderDrag : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void send(Array.from(e.dataTransfer.files));
      }}
    >
      <div className={styles.pickRow}>
        <label className={styles.pick} aria-disabled={busy}>
          ⬆ آپلود عکس و ویدیو
          <input type="file" multiple accept={`${IMAGE_ACCEPT},${VIDEO_ACCEPT}`} onChange={pick} disabled={busy} aria-label="آپلود عکس و ویدیوی محصول" />
        </label>
        <label className={`${styles.pick} ${styles.camera}`} aria-disabled={busy}>
          📷 دوربین
          <input type="file" accept="image/*" capture="environment" onChange={pick} disabled={busy} aria-label="عکس با دوربین" />
        </label>
        <Checkbox label="دارای لوگوی کارخانه — منتشر نشود" checked={hasLogo} onChange={(e) => setHasLogo(e.target.checked)} disabled={busy} />
      </div>
      <span className={styles.status} style={{ color: "var(--muted)" }}>
        چند فایل با هم (حداکثر {props.batchMax.toLocaleString("fa-IR")})؛ هر عکس تا {props.imageMaxMb.toLocaleString("fa-IR")} مگابایت (JPEG، PNG، WebP، GIF، AVIF)، ویدیو MP4 یا
        WebM تا {props.videoMaxMb.toLocaleString("fa-IR")} مگابایت. می‌توانید فایل‌ها را اینجا بکشید و رها کنید. عکس‌ها خودکار کوچک و WebP می‌شوند و اطلاعات داخل فایل (EXIF، مکان)
        پاک می‌شود.
      </span>
      {note && <span className={styles.statusErr}>{note}</span>}
      {rows.length > 0 && (
        <ul className={styles.list} aria-live="polite">
          {rows.map((r, i) => (
            <li key={i} className={styles.item}>
              <span className={styles.name}>{r.name}</span>
              <span className={r.error ? styles.statusErr : r.done ? styles.statusOk : styles.status}>
                {r.error ?? (r.done ? "✓ ذخیره شد" : `${Math.round(r.progress * 100)}٪`)}
              </span>
              {!r.error && (
                <span className={styles.bar}>
                  <span style={{ width: `${Math.round(r.progress * 100)}%` }} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
