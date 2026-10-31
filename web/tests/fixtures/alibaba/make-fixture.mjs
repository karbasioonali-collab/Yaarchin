// ساخت نمونه‌ی تست از یک صفحه‌ی ذخیره‌شده‌ی علی‌بابا (MHTML) برای tests/unit/alibaba.test.mjs. docs/infoyaarchin.md بخش ۳۵.
// فایل MHTML و نقشه‌ی اسم‌ها هرگز در ریپو نمی‌آیند؛ فقط خروجی کوچک‌شده و ناشناس:
//   <name>.html            ← فقط HTML اصلی، بدون CSS/اسکریپت/SVG/منو، بدون class و style، با اسم‌ها و شناسه‌های عوض‌شده (حدود ۱۵۰ کیلوبایت)
//   <name>.resources.json  ← لینک صفحه + فهرست عکس‌های داخل فایل (نوع و حجم؛ بدون بایت) تا تست «داخل فایل هست؟» کار کند
//   <name>.expected.json   ← خروجی خواننده (فقط اگر نیست، یا با --update). بعد از ساخت، دستی بازبینی شود.
// اجرا (از پوشه‌ی web):
//   node --experimental-strip-types --no-warnings --import ./tests/unit/ts-resolve.mjs tests/fixtures/alibaba/make-fixture.mjs \
//     <file.mhtml> <names.json> <name> [--update]
// names.json: {"اسم واقعی": "اسم ساختگی", …}؛ جایگزینی بدون حساسیت به حروف بزرگ و کوچک، بلندترها اول.
// خودکار هم: هر عدد ۱۲ یا ۱۳ رقمی (شناسه‌ی محصول) و هر شناسه‌ی عکس alicdn («H» + ۳۲ هگز) با معادل ساختگی ثابت عوض می‌شود.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseDocument } from "htmlparser2";
import { parseMhtml } from "../../../src/lib/import/alibaba/mhtml.ts";
import { parseAlibabaProduct } from "../../../src/lib/import/alibaba/parse.ts";

const [src, namesFile, name] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!src || !namesFile || !name) throw new Error("استفاده: make-fixture.mjs <file.mhtml> <names.json> <name> [--update]");
const update = process.argv.includes("--update");
const dir = new URL(".", import.meta.url).pathname;
const names = Object.entries(JSON.parse(readFileSync(namesFile, "utf8"))).sort((a, b) => b[0].length - a[0].length);

const m = parseMhtml(readFileSync(src));
const h = (s) => createHash("sha1").update(s).digest("hex");
const fakeId = (id) =>
  "9" +
  String(parseInt(h(id).slice(0, 12), 16))
    .padStart(id.length, "0")
    .slice(0, id.length - 1);
const anon = (s) => {
  let out = s;
  for (const [real, fake] of names) out = out.replace(new RegExp(real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), fake);
  out = out.replace(/(?<!\d)\d{12,13}(?!\d)/g, fakeId);
  return out.replace(/\bH([0-9a-f]{32})([A-Za-z0-9])/g, (_, hex, last) => `H${h(hex).slice(0, 32)}${last}`);
};

// ---------- کوچک کردن HTML ----------
const DROP_TAGS = new Set(["script", "style", "link", "noscript", "svg", "iframe", "template", "picture", "source", "video", "canvas"]);
const KEEP_ATTRS = new Set([
  "data-testid",
  "data-module-name",
  "data-section",
  "aria-label",
  "href",
  "src",
  "data-src",
  "alt",
  "title",
  "property",
  "content",
  "role",
  "lang",
  "dir",
]);
const VOID = new Set(["img", "br", "meta", "input", "hr", "area", "base", "col", "wbr"]);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
let recommendCards = 0;
function ser(n) {
  if (n.type === "text") return esc(n.data);
  if (n.type === "comment" || n.type === "directive" || n.type === "cdata") return "";
  if (n.type === "root") return n.children.map(ser).join("");
  if (DROP_TAGS.has(n.name)) return "";
  if (n.name === "meta" && !/^og:/.test(n.attribs.property ?? "")) return "";
  // کارت‌های «محصولات پیشنهادی»: دو تا می‌مانند (برای تست اینکه قیمتشان خوانده نشود)
  if (n.attribs["data-testid"] === "other-recommendation-product-card" && ++recommendCards > 2) return "";
  const attrs = Object.entries(n.attribs)
    .filter(([k, v]) => KEEP_ATTRS.has(k) && !(k === "src" && v.startsWith("data:")))
    .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
    .join("");
  const inner = n.children.map(ser).join("");
  // div و span خالی بی‌ویژگی چیزی به خواننده نمی‌دهند
  if (!attrs && !inner.trim() && (n.name === "div" || n.name === "span")) return "";
  return VOID.has(n.name) ? `<${n.name}${attrs}>` : `<${n.name}${attrs}>${inner}</${n.name}>`;
}
const html = anon(ser(parseDocument(m.html, { decodeEntities: true })).replace(/\n\s*\n/g, "\n"));
const url = anon(m.url ?? "");

// ---------- عکس‌های داخل فایل که در HTML آمده‌اند ----------
const resources = {};
for (const [loc, r] of m.resources) {
  if (!r.type.startsWith("image/")) continue;
  const fake = anon(loc);
  if (html.includes(fake.replace(/^https:/, "")) || html.includes(fake)) resources[fake] = [r.type, r.size];
}

writeFileSync(`${dir}${name}.html`, `<!-- نمونه‌ی ناشناس‌شده‌ی صفحه‌ی علی‌بابا برای تست؛ ساخته‌شده با make-fixture.mjs -->\n${html}\n`);
writeFileSync(`${dir}${name}.resources.json`, JSON.stringify({ url, resources }, null, 1) + "\n");
const lookup = (u) => (resources[u] ? { type: resources[u][0], size: resources[u][1] } : null);
const parsed = parseAlibabaProduct(html, { url, lookup });
if (update || !existsSync(`${dir}${name}.expected.json`)) writeFileSync(`${dir}${name}.expected.json`, JSON.stringify(parsed, null, 1) + "\n");
console.log(`${name}: html ${Math.round(html.length / 1024)} KB, ${Object.keys(resources).length} embedded images; title: ${parsed.title}`);
