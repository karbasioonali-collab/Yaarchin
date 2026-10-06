// فایل‌های «حالت آزمایشی» (وقتی فضای ابری وصل نیست) از دیسک خود برنامه. docs/infoyaarchin.md بخش ۲۶.
// این فایل‌ها با هر استقرار پاک می‌شوند؛ برای عکسی که دیگر نیست یک تصویر جایگزین «فایل آزمایشی پاک شده» (با وضعیت ۴۰۴) برمی‌گردد.
// فقط اسم فایل‌هایی که خود برنامه می‌سازد پذیرفته می‌شود (هیچ مسیر دلخواهی خوانده نمی‌شود).
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { openLocal } from "@/lib/media/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE_RE = /^(img\/\d{4}\/\d{2}\/[a-z0-9]{24}-(480|1000|1800)\.webp|vid\/\d{4}\/\d{2}\/[a-z0-9]{24}\.(mp4|webm))$/;

const MISSING = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><rect width="480" height="480" fill="#F7F7F5"/><rect x="190" y="160" width="100" height="80" rx="8" fill="none" stroke="#B9B9B4" stroke-width="6"/><circle cx="218" cy="188" r="10" fill="#B9B9B4"/><path d="M196 232l30-28 22 20 14-12 24 20" fill="none" stroke="#B9B9B4" stroke-width="6"/><text x="240" y="300" font-family="Vazirmatn,Tahoma,sans-serif" font-size="22" fill="#6B6B66" text-anchor="middle" direction="rtl">فایل آزمایشی پاک شده</text></svg>`;

const COMMON = { "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" };

export async function GET(req: NextRequest, ctx: RouteContext<"/files/[...key]">) {
  const { key } = await ctx.params;
  const file = key.join("/");
  if (!FILE_RE.test(file)) return new Response("not found", { status: 404, headers: COMMON });
  const isVideo = file.startsWith("vid/");
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get("range") ?? "");
  const range = m ? { start: Number(m[1]), end: m[2] ? Number(m[2]) : undefined } : undefined;
  const f = await openLocal(file, range);
  if (!f) {
    if (isVideo) return new Response("not found", { status: 404, headers: COMMON });
    return new Response(MISSING, { status: 404, headers: { ...COMMON, "content-type": "image/svg+xml", "cache-control": "no-store" } });
  }
  const type = file.endsWith(".webp") ? "image/webp" : file.endsWith(".webm") ? "video/webm" : "video/mp4";
  const headers: Record<string, string> = { ...COMMON, "content-type": type, "accept-ranges": "bytes", "cache-control": "public, max-age=3600" };
  if (!f.stream) return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${f.size}` } });
  headers["content-length"] = String(f.end - f.start + 1);
  if (range) headers["content-range"] = `bytes ${f.start}-${f.end}/${f.size}`;
  return new Response(Readable.toWeb(f.stream) as ReadableStream, { status: range ? 206 : 200, headers });
}
