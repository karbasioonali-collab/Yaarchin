"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import ui from "@/components/ui/ui.module.css";

// آپلود فایل MHTML با نوار پیشرفت (XMLHttpRequest؛ fetch هنوز پیشرفت آپلود ندارد). docs/infoyaarchin.md بخش ۳۶.
type Res = { ok: true; id: string } | { ok: false; error: string; duplicateId?: string };

function send(file: File, onProgress: (f: number) => void): Promise<Res> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/import/upload");
    xhr.setRequestHeader("x-yc-upload", "1");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText) as Res);
      } catch {
        resolve({ ok: false, error: xhr.status === 413 ? "فایل برای سرور بزرگ است (۴۱۳)." : `خطای سرور (${xhr.status}).` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "ارتباط قطع شد؛ دوباره امتحان کنید." });
    xhr.send(file);
  });
}

export function ImportUploader({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; progress: number; error: string | null; duplicateId: string | null }>({
    busy: false,
    progress: 0,
    error: null,
    duplicateId: null,
  });
  const pick = async () => {
    const f = input.current?.files?.[0];
    if (!f) return;
    if (f.size > maxMb * 1024 * 1024) return setState({ busy: false, progress: 0, error: `فایل بزرگ‌تر از ${maxMb} مگابایت است.`, duplicateId: null });
    setState({ busy: true, progress: 0, error: null, duplicateId: null });
    const r = await send(f, (p) => setState((s) => ({ ...s, progress: p })));
    if (input.current) input.current.value = "";
    if (r.ok) return router.push(`/admin/import/${r.id}`);
    setState({ busy: false, progress: 0, error: r.error, duplicateId: r.duplicateId ?? null });
  };
  return (
    <div className={ui.form}>
      <label className={ui.field}>
        <span className={ui.label}>فایل ذخیره‌شده‌ی صفحه (‎.mhtml، حداکثر {maxMb.toLocaleString("fa-IR")} مگابایت)</span>
        <input ref={input} type="file" accept=".mhtml,.mht,.html,.htm,multipart/related,text/html" onChange={pick} disabled={state.busy} />
      </label>
      {state.busy && (
        <p className={ui.hint} role="status">
          {state.progress < 1 ? `در حال آپلود… ${Math.round(state.progress * 100).toLocaleString("fa-IR")}٪` : "در حال خواندن صفحه…"}
        </p>
      )}
      {state.error && (
        <p className={ui.error} role="alert">
          {state.error}
          {state.duplicateId && (
            <>
              {" "}
              <Link href={`/admin/import/${state.duplicateId}`}>دیدن صفحه‌ی قبلی</Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
