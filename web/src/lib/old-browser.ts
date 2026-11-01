// تشخیص مرورگر قدیمی‌تر از حداقل Next.js 16 (Chrome/Edge/Firefox ۱۱۱، Safari ۱۶٫۴) از روی User-Agent، سمت سرور. بخش ۳۸.
// چرا سمت سرور: در مرورگر قدیمی خود جاوااسکریپت صفحه ممکن است درست اجرا نشود (مثلاً کروم ۱۰۹ ویندوز ۷: انتخاب‌های فرم برمی‌گشت)،
// پس هشداری که به JS وابسته باشد شاید اصلاً نمایش داده نشود. خالص؛ تست واحد مستقیم اجرایش می‌کند.
export type OldBrowser = { name: string; version: number; win7: boolean } | null;

export function oldBrowser(ua: string | null | undefined): OldBrowser {
  if (!ua) return null;
  const win7 = /Windows NT 6\.[01]\b/.test(ua);
  const ver = (re: RegExp) => Number(re.exec(ua)?.[1] ?? NaN);
  let r: { name: string; version: number; min: number } | null = null;
  if (/Edg\//.test(ua)) r = { name: "Edge", version: ver(/Edg\/(\d+)/), min: 111 };
  else if (/OPR\//.test(ua)) r = null; // Opera: نسخه‌ی Chromium را از Chrome/ می‌خوانیم
  if (!r && /Firefox\//.test(ua)) r = { name: "Firefox", version: ver(/Firefox\/(\d+)/), min: 111 };
  if (!r && /Chrome\//.test(ua)) r = { name: "Chrome", version: ver(/Chrome\/(\d+)/), min: 111 };
  if (!r && /Version\/[\d.]+.*Safari\//.test(ua)) {
    const m = /Version\/(\d+)\.(\d+)/.exec(ua);
    const v = m ? Number(m[1]) + Number(m[2]) / 100 : NaN;
    return Number.isFinite(v) && v < 16.04 ? { name: "Safari", version: Number(m![1]), win7 } : null;
  }
  return r && Number.isFinite(r.version) && r.version < r.min ? { name: r.name, version: r.version, win7 } : null;
}
