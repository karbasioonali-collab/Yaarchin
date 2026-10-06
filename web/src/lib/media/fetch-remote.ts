import "server-only";
// دانلود امن یک فایل از لینک (وارد کردن عکس از لینک؛ docs/infoyaarchin.md بخش ۲۷).
// - IP هر اتصال در lookup همان اتصال بررسی می‌شود (نه یک بار جدا): DNS نمی‌تواند بین بررسی و اتصال عوض شود (DNS rebinding).
// - حداکثر ۳ تغییر مسیر (redirect)؛ هر مقصد تازه از اول بررسی می‌شود.
// - سقف حجم (Content-Length و هنگام خواندن) و سقف زمان کل.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { checkImportUrl, isPublicIp } from "./net-guard";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;

export class RemoteError extends Error {}

const guardedLookup: LookupFunction = (hostname, options, cb) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, "", 0);
    const list = (addresses as LookupAddress[]).filter((a) => isPublicIp(a.address));
    if (!list.length) return cb(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }), "", 0);
    if (options.all) return (cb as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    cb(null, list[0].address, list[0].family);
  });
};

function once(url: URL, maxBytes: number, deadline: number): Promise<{ redirect: string } | { buf: Buffer; type: string | null }> {
  return new Promise((resolve, reject) => {
    const left = deadline - Date.now();
    if (left <= 0) return reject(new RemoteError("زمان دانلود تمام شد."));
    const req = https.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        timeout: left,
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
          accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: res.headers.location });
        }
        if (status !== 200) {
          res.resume();
          return reject(new RemoteError(`سرور مقصد پاسخ ${status.toLocaleString("fa-IR", { useGrouping: false })} داد${status === 403 ? " (اجازه‌ی دانلود نداد)" : status === 404 ? " (فایل پیدا نشد)" : ""}.`));
        }
        const len = Number(res.headers["content-length"] ?? "");
        if (Number.isFinite(len) && len > maxBytes) {
          res.destroy();
          return reject(new RemoteError(`فایل بزرگ‌تر از حد مجاز است.`));
        }
        const chunks: Buffer[] = [];
        let n = 0;
        res.on("data", (c: Buffer) => {
          n += c.length;
          if (n > maxBytes) {
            res.destroy();
            reject(new RemoteError("فایل بزرگ‌تر از حد مجاز است."));
          } else chunks.push(c);
        });
        res.on("end", () => resolve({ buf: Buffer.concat(chunks), type: res.headers["content-type"] ?? null }));
        res.on("error", (e) => reject(e));
      },
    );
    req.on("timeout", () => req.destroy(new RemoteError("زمان دانلود تمام شد.")));
    req.on("error", (e: NodeJS.ErrnoException) => {
      if (e instanceof RemoteError) return reject(e);
      if (e.code === "EBLOCKED") return reject(new RemoteError("لینک به آدرس داخلی یا خصوصی اشاره می‌کند."));
      if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN") return reject(new RemoteError("دامنه‌ی لینک پیدا نشد."));
      reject(new RemoteError("اتصال به سرور مقصد ناموفق بود."));
    });
    req.end();
  });
}

export async function downloadFile(raw: string, maxBytes: number): Promise<{ buf: Buffer; finalUrl: string; type: string | null }> {
  const deadline = Date.now() + TIMEOUT_MS;
  let current = raw;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const c = checkImportUrl(current);
    if ("error" in c) throw new RemoteError(i ? `تغییر مسیر لینک پذیرفته نیست: ${c.error}` : c.error);
    const r = await once(c.url, maxBytes, deadline);
    if ("buf" in r) {
      if (!r.buf.length) throw new RemoteError("فایل خالی است.");
      return { buf: r.buf, finalUrl: c.url.toString(), type: r.type };
    }
    current = new URL(r.redirect, c.url).toString();
  }
  throw new RemoteError("تغییر مسیرهای لینک بیش از حد است.");
}
