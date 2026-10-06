"use client";
// ارسال یک فایل به /api/admin/media/upload با نوار پیشرفت (XMLHttpRequest؛ fetch هنوز پیشرفت آپلود ندارد).
// docs/infoyaarchin.md بخش ۲۶.
export type UploadOk = { ok: true; key: string; kind: "image" | "video"; url: string | null; id?: string };
export type UploadResult = UploadOk | { ok: false; error: string };

// ورودی فایل: فقط این‌ها در پنجره‌ی انتخاب نشان داده می‌شوند (سرور خودش نوع واقعی را دوباره بررسی می‌کند)
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
export const VIDEO_ACCEPT = "video/mp4,video/webm";

export function uploadFile(file: File, params: Record<string, string>, onProgress?: (fraction: number) => void): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/media/upload?${new URLSearchParams(params)}`);
    xhr.setRequestHeader("x-yc-upload", "1");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const j = JSON.parse(xhr.responseText) as UploadResult;
        resolve(j.ok ? j : { ok: false, error: j.error || `خطا (${xhr.status})` });
      } catch {
        // پاسخ غیر JSON: معمولاً محدودیت حجم یک پراکسی جلوتر از برنامه (۴۱۳)
        resolve({ ok: false, error: xhr.status === 413 ? "فایل برای سرور بزرگ است (۴۱۳)." : `خطای سرور (${xhr.status}).` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "ارتباط قطع شد؛ دوباره امتحان کنید." });
    xhr.send(file);
  });
}
