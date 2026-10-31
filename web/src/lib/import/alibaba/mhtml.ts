// خواندن فایل «Webpage, Single File» کروم (MHTML) بدون کتابخانه. docs/infoyaarchin.md بخش ۳۵.
// بدون server-only تا تست واحد مستقیم اجرایش کند.
//
// ساختار: سرآیند (Snapshot-Content-Location = لینک صفحه، Subject = عنوان) و چند بخش با boundary. هر بخش سرآیند خودش را دارد
// (Content-Type، Content-Transfer-Encoding، Content-Location) و بعد از یک خط خالی، بدنه. HTML و CSS با quoted-printable،
// عکس‌ها با base64.
// حافظه: فایل یک بار در Buffer است (حدود ۹ مگابایت). فقط جای هر بخش نگه داشته می‌شود و بدنه فقط وقتی خواسته شود decode می‌شود؛
// CSS (بیشتر حجم فایل) هیچ‌وقت decode نمی‌شود.
// نکته: کروم موقع ذخیره همه‌ی <script>ها را حذف می‌کند؛ HTML داخل فایل فقط DOM نمایش‌داده‌شده است.

export type MhtmlResource = { location: string; type: string; size: number; read: () => Buffer };
export type Mhtml = { url: string | null; subject: string | null; html: string; frames: string[]; resources: Map<string, MhtmlResource> };

export class MhtmlError extends Error {}

const CRLF = /\r?\n/;

function headerBlock(text: string): Record<string, string> {
  // خط‌های ادامه (با فاصله یا tab شروع می‌شوند) به خط قبل می‌چسبند
  const out: Record<string, string> = {};
  let last = "";
  for (const line of text.split(CRLF)) {
    if (/^[ \t]/.test(line) && last) out[last] += " " + line.trim();
    else {
      const i = line.indexOf(":");
      if (i <= 0) continue;
      last = line.slice(0, i).trim().toLowerCase();
      out[last] = line.slice(i + 1).trim();
    }
  }
  return out;
}

// quoted-printable ← بایت (متن UTF-8 چندبایتی سالم می‌ماند چون روی بایت کار می‌کند)
export function decodeQuotedPrintable(src: Buffer): Buffer {
  const out = Buffer.alloc(src.length);
  let o = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c !== 0x3d) {
      out[o++] = c;
      continue;
    }
    // «=» آخر خط ← شکستن نرم (حذف)
    if (src[i + 1] === 0x0d && src[i + 2] === 0x0a) {
      i += 2;
      continue;
    }
    if (src[i + 1] === 0x0a) {
      i += 1;
      continue;
    }
    const hex = src.toString("latin1", i + 1, i + 3);
    if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
      out[o++] = parseInt(hex, 16);
      i += 2;
    } else out[o++] = c;
  }
  return out.subarray(0, o);
}

function decodeBody(body: Buffer, encoding: string): Buffer {
  const e = encoding.toLowerCase();
  if (e === "base64") return Buffer.from(body.toString("latin1").replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
  if (e === "quoted-printable") return decodeQuotedPrintable(body);
  return body;
}

export function parseMhtml(buf: Buffer): Mhtml {
  const headEnd = (() => {
    const a = buf.indexOf("\r\n\r\n");
    const b = buf.indexOf("\n\n");
    return a >= 0 && (b < 0 || a < b) ? a : b;
  })();
  if (headEnd < 0) throw new MhtmlError("سرآیند فایل پیدا نشد؛ این فایل MHTML نیست.");
  const head = headerBlock(buf.toString("utf8", 0, headEnd));
  const boundary = /boundary="?([^";]+)"?/i.exec(head["content-type"] ?? "")?.[1];
  if (!boundary || !/multipart\/related/i.test(head["content-type"] ?? ""))
    throw new MhtmlError("این فایل MHTML نیست (multipart/related ندارد). صفحه را با «Webpage, Single File» ذخیره کنید.");
  const marker = Buffer.from("--" + boundary);
  const starts: number[] = [];
  for (let i = buf.indexOf(marker, headEnd); i >= 0; i = buf.indexOf(marker, i + marker.length)) starts.push(i);
  const resources = new Map<string, MhtmlResource>();
  const htmls: string[] = [];
  for (let k = 0; k < starts.length - 1; k++) {
    const begin = starts[k] + marker.length;
    const end = starts[k + 1];
    let hdrEnd = buf.indexOf("\r\n\r\n", begin);
    let sep = 4;
    const lf = buf.indexOf("\n\n", begin);
    if (hdrEnd < 0 || (lf >= 0 && lf < hdrEnd)) {
      hdrEnd = lf;
      sep = 2;
    }
    if (hdrEnd < 0 || hdrEnd > end) continue;
    const h = headerBlock(buf.toString("utf8", begin, hdrEnd));
    const type = (h["content-type"] ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
    const encoding = h["content-transfer-encoding"] ?? "binary";
    // بدنه بدون شکستن خط قبل از boundary بعدی
    let bodyEnd = end;
    if (buf[bodyEnd - 1] === 0x0a) bodyEnd--;
    if (buf[bodyEnd - 1] === 0x0d) bodyEnd--;
    const raw = buf.subarray(hdrEnd + sep, bodyEnd);
    if (type === "text/html") {
      htmls.push(decodeBody(raw, encoding).toString("utf8"));
      continue;
    }
    const location = h["content-location"] ?? h["content-id"] ?? "";
    if (!location || resources.has(location)) continue;
    let cached: Buffer | null = null;
    // حجم تقریبی بدون decode (base64 حدود ۳/۴)
    const size = encoding.toLowerCase() === "base64" ? Math.floor((raw.length * 3) / 4) : raw.length;
    resources.set(location, { location, type, size, read: () => (cached ??= decodeBody(raw, encoding)) });
  }
  if (!htmls.length) throw new MhtmlError("داخل فایل هیچ صفحه‌ی HTML نیست.");
  return { url: head["snapshot-content-location"] ?? null, subject: head["subject"] ?? null, html: htmls[0], frames: htmls.slice(1), resources };
}
