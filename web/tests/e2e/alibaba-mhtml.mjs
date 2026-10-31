// ساخت فایل MHTML ساختگی (مثل «Webpage, Single File» کروم) از نمونه‌های ناشناس tests/fixtures/alibaba و عکس‌های ساختگی.
// مشترک بین alibaba-import و alibaba-register. docs/infoyaarchin.md بخش‌های ۳۶ و ۳۷.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const sharp = createRequire(new URL("../../package.json", import.meta.url))("sharp");
const FX = new URL("../fixtures/alibaba/", import.meta.url);
const run = Date.now().toString(36);

// ---------- ساخت MHTML ساختگی ----------
// quoted-printable مثل کروم: «=» و بایت‌های غیر ASCII ← =XX، خط‌های حداکثر ۷۶ با «=» آخر خط
function qp(buf) {
  const out = [];
  let line = "";
  for (const b of buf) {
    const t = b === 0x0a ? "\n" : b === 0x3d || b > 126 || (b < 32 && b !== 9 && b !== 0x0a) ? "=" + b.toString(16).toUpperCase().padStart(2, "0") : String.fromCharCode(b);
    if (t === "\n") {
      out.push(line + "\r");
      line = "";
      continue;
    }
    if (line.length + t.length > 75) {
      out.push(line + "=\r");
      line = "";
    }
    line += t;
  }
  out.push(line);
  return out.join("\n");
}
export async function mhtml(name, { extra = "", avif = false } = {}) {
  const html = readFileSync(new URL(`${name}.html`, FX), "utf8").replace("</body>", `${extra}</body>`);
  const { url } = JSON.parse(readFileSync(new URL(`${name}.resources.json`, FX), "utf8"));
  const exp = JSON.parse(readFileSync(new URL(`${name}.expected.json`, FX), "utf8"));
  const B0 = "----MultipartBoundary--e2e" + run + "----";
  const parts = [
    `From: <Saved by Blink>\r\nSnapshot-Content-Location: ${url}\r\nSubject: test\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n\ttype="text/html";\r\n\tboundary="${B0}"\r\n\r\n`,
    `--${B0}\r\nContent-Type: text/html\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Location: ${url}\r\n\r\n${qp(Buffer.from(html, "utf8"))}\r\n`,
    `--${B0}\r\nContent-Type: text/css\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Location: cid:css-1@mhtml.blink\r\n\r\nbody{color:red}\r\n`,
  ];
  let i = 0;
  for (const img of exp.images) {
    if (!img.embedded) continue;
    // avif: عکس اول AVIF واقعی (مثل علی‌بابا)؛ بقیه PNG
    const base = sharp({ create: { width: 64, height: 64, channels: 3, background: { r: (i * 40) % 256, g: 120, b: 200 } } });
    const png = await (avif && i === 0 ? base.avif() : base.png()).toBuffer();
    parts.push(
      `--${B0}\r\nContent-Type: image/avif\r\nContent-Transfer-Encoding: base64\r\nContent-Location: ${img.url}\r\n\r\n${png.toString("base64").replace(/(.{76})/g, "$1\r\n")}\r\n`,
    );
    i++;
  }
  parts.push(`--${B0}--\r\n`);
  return Buffer.from(parts.join(""), "latin1");
}
