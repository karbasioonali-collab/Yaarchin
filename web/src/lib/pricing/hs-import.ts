import "server-only";
// ورود لیست HS code از فایل اکسل (.xlsx) یا CSV — بدون کتابخانه‌ی جدید.
//
// xlsx در واقع یک فایل zip است با چند XML داخلش. اینجا فقط همان مقدار لازم خوانده می‌شود:
//   ۱) فهرست فایل‌های zip از «central directory» انتهای فایل؛ ۲) باز کردن هر فایل با zlib.inflateRawSync (روش 8) یا بدون فشرده‌سازی (روش 0)؛
//   ۳) xl/workbook.xml ← اولین شیت ← مسیرش از xl/_rels/workbook.xml.rels؛ ۴) متن‌های مشترک xl/sharedStrings.xml؛ ۵) سلول‌های شیت.
// محدودیت‌ها (عمدی): فقط اولین شیت، بدون zip64، بدون رمز، حجم باز‌شده‌ی هر فایل حداکثر ۶۰ مگابایت (در برابر zip bomb).
// فرمول‌های اکسل خوانده نمی‌شوند؛ فقط مقدار ذخیره‌شده‌ی سلول (<v>) — اکسل همیشه آخرین نتیجه را ذخیره می‌کند.
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { toLatinDigits } from "@/lib/validation";
import { normHs } from "./snapshot";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_UNZIPPED = 60 * 1024 * 1024;
export const MAX_ROWS = 20000;

export class ImportError extends Error {}

// ---------- zip ----------
function unzip(buf: Buffer): Map<string, () => Buffer> {
  // End of Central Directory: امضای 0x06054b50، حداکثر ۶۵۵۳۵+۲۲ بایت از انتها
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ImportError("فایل اکسل معتبر نیست (ساختار zip پیدا نشد).");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, () => Buffer>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ImportError("فایل اکسل خراب است.");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    files.set(name, () => {
      if (buf.readUInt32LE(local) !== 0x04034b50) throw new ImportError("فایل اکسل خراب است.");
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + compSize);
      if (size > MAX_UNZIPPED) throw new ImportError("فایل اکسل بیش از حد بزرگ است.");
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED });
      throw new ImportError("این نوع فشرده‌سازی اکسل پشتیبانی نمی‌شود؛ فایل را CSV ذخیره کنید.");
    });
  }
  return files;
}

const unescapeXml = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) =>
    e === "lt"
      ? "<"
      : e === "gt"
        ? ">"
        : e === "amp"
          ? "&"
          : e === "quot"
            ? '"'
            : e === "apos"
              ? "'"
              : String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)),
  );
// همه‌ی <t>…</t> داخل یک تکه (متن غنی چند تکه دارد)
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join("");
const colIndex = (ref: string) => {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export function readXlsx(buf: Buffer): string[][] {
  const files = unzip(buf);
  const get = (name: string) => files.get(name)?.().toString("utf8") ?? null;
  const workbook = get("xl/workbook.xml");
  if (!workbook) throw new ImportError("فایل اکسل معتبر نیست (xl/workbook.xml نیست). اگر فایل .xls قدیمی است، در اکسل «Save as → .xlsx» یا CSV کنید.");
  const firstSheet = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1] ?? workbook.match(/<sheet\b[^>]*\bid="([^"]+)"/)?.[1];
  const rels = get("xl/_rels/workbook.xml.rels") ?? "";
  let target = firstSheet ? rels.match(new RegExp(`<Relationship\\b[^>]*Id="${firstSheet}"[^>]*Target="([^"]+)"`))?.[1] : undefined;
  target ??= firstSheet ? rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstSheet}"`))?.[1] : undefined;
  const path = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`) : "xl/worksheets/sheet1.xml";
  const sheet = get(path) ?? get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new ImportError("شیت اول فایل اکسل پیدا نشد.");
  const sharedXml = get("xl/sharedStrings.xml");
  const shared = sharedXml ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1])) : [];

  const out: string[][] = [];
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = "";
      if (type === "s") val = v !== undefined ? (shared[Number(v)] ?? "") : "";
      else if (type === "inlineStr") val = texts(body);
      else val = v !== undefined ? unescapeXml(v) : "";
      const idx = ref ? colIndex(ref) : cells.length;
      while (cells.length < idx) cells.push("");
      cells[idx] = val;
    }
    out.push(cells);
    if (out.length > MAX_ROWS + 1) throw new ImportError(`فایل بیش از ${MAX_ROWS.toLocaleString("fa-IR")} ردیف دارد.`);
  }
  return out;
}

// ---------- CSV ----------
// جداکننده خودکار (کاما، نقطه‌ویرگول یا Tab؛ اکسل فارسی گاهی ; می‌گذارد)، نقل‌قول دوتایی، BOM ابتدای فایل.
export function readCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const firstLine = s.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (rows.length > MAX_ROWS + 1) throw new ImportError(`فایل بیش از ${MAX_ROWS.toLocaleString("fa-IR")} ردیف دارد.`);
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function readTable(name: string, buf: Buffer): string[][] {
  if (buf.length > MAX_FILE_BYTES) throw new ImportError("حجم فایل حداکثر ۴ مگابایت.");
  const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (/\.xlsx$/i.test(name) || isZip) return readXlsx(buf);
  if (/\.xls$/i.test(name)) throw new ImportError("فرمت .xls قدیمی پشتیبانی نمی‌شود؛ در اکسل «Save as → .xlsx» یا CSV کنید.");
  return readCsv(buf.toString("utf8"));
}

export const fileHash = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

// ---------- ستون‌ها و ردیف‌ها ----------
// سرستون‌ها (ردیف اول) با هر کدام از این اسم‌ها شناخته می‌شوند (فاصله، خط تیره و بزرگی حروف مهم نیست).
const HEADERS: Record<string, string[]> = {
  code: ["code", "hs", "hscode", "hs_code", "کد", "کدتعرفه", "تعرفه", "کدhs", "hsکد", "شمارهتعرفه"],
  title: ["title", "description", "name", "شرح", "عنوان", "شرحکالا", "نامکالا"],
  type: ["type", "dutytype", "duty_type", "نوع", "نوعحقوق"],
  value: ["value", "duty", "rate", "مقدار", "حقوق", "حقوقورودی", "درصد", "نرخ", "مبلغ"],
  currency: ["currency", "ارز"],
  per: ["per", "fixedper", "fixed_per", "بهازای", "واحد"],
  base: ["base", "dutybase", "duty_base", "پایه"],
  active: ["active", "isactive", "فعال", "وضعیت"],
};
const normHeader = (s: string) =>
  toLatinDigits(s)
    .toLowerCase()
    .replace(/[\s‌\-_.:]/g, "");

export type HsImportRow = {
  line: number;
  code: string;
  titleFa: string | null;
  dutyType: "percent" | "fixed";
  dutyValue: number;
  dutyBase: string[] | null;
  dutyCurrency: string | null;
  fixedPer: "unit" | "kg" | "shipment" | null;
  isActive: boolean;
};
export type HsParse = { rows: HsImportRow[]; errors: { line: number; message: string }[]; columns: string[] };

const TYPE_ALIASES: Record<string, "percent" | "fixed"> = {
  percent: "percent",
  "%": "percent",
  درصد: "percent",
  درصدی: "percent",
  fixed: "fixed",
  ثابت: "fixed",
  مبلغ: "fixed",
  مبلغثابت: "fixed",
};
const PER_ALIASES: Record<string, "unit" | "kg" | "shipment"> = {
  unit: "unit",
  piece: "unit",
  عدد: "unit",
  هرعدد: "unit",
  kg: "kg",
  کیلو: "kg",
  هرکیلو: "kg",
  کیلوگرم: "kg",
  shipment: "shipment",
  محموله: "shipment",
  کلمحموله: "shipment",
};
const BASE_ALIASES: Record<string, string> = {
  goods: "goods",
  کالا: "goods",
  ارزشکالا: "goods",
  shipping: "shipping",
  حمل: "shipping",
  هزینهحمل: "shipping",
  costs: "costs",
  هزینهها: "costs",
  بیمه: "costs",
  سایر: "costs",
};

export function parseHsTable(table: string[][], currencies: Set<string>): HsParse {
  const errors: HsParse["errors"] = [];
  const rows: HsImportRow[] = [];
  const header = (table[0] ?? []).map(normHeader);
  const col: Record<string, number> = {};
  for (const [k, names] of Object.entries(HEADERS)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) col[k] = i;
  }
  if (col.code === undefined || col.value === undefined) {
    throw new ImportError("ردیف اول فایل باید سرستون داشته باشد؛ دست‌کم ستون «کد» (code) و «مقدار» (value). نمونه‌ی فایل را از همین صفحه بگیرید.");
  }
  const seen = new Map<string, number>();
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const cell = (k: string) => (col[k] === undefined ? "" : toLatinDigits(String(r[col[k]] ?? "")).trim());
    if (r.every((c) => !String(c ?? "").trim())) continue;
    const err = (message: string) => errors.push({ line, message });

    const code = normHs(cell("code"));
    if (!code) {
      err(`کد «${cell("code")}» معتبر نیست (۴ تا ۱۲ رقم).`);
      continue;
    }
    if (seen.has(code)) {
      err(`کد ${code} تکراری است (قبلاً در ردیف ${seen.get(code)!.toLocaleString("fa-IR")}).`);
      continue;
    }
    seen.set(code, line);

    const rawValue = cell("value")
      .replace(/[٫]/g, ".")
      .replace(/[,،٬\s]/g, "");
    const value = Number(rawValue.replace(/[%٪]$/, ""));
    if (!rawValue || !Number.isFinite(value) || value < 0) {
      err(`مقدار حقوق ورودی «${cell("value")}» عدد معتبر نیست.`);
      continue;
    }
    const typeRaw = normHeader(cell("type"));
    const dutyType = typeRaw ? TYPE_ALIASES[typeRaw] : "percent";
    if (!dutyType) {
      err(`نوع «${cell("type")}» نامعتبر است (percent/درصد یا fixed/ثابت).`);
      continue;
    }
    if (dutyType === "percent" && value > 1000) {
      err(`درصد ${value} بیش از حد بزرگ است.`);
      continue;
    }
    let dutyCurrency: string | null = null;
    let fixedPer: HsImportRow["fixedPer"] = null;
    let dutyBase: string[] | null = null;
    if (dutyType === "fixed") {
      dutyCurrency = (cell("currency") || "IRT").toUpperCase();
      if (!currencies.has(dutyCurrency)) {
        err(`ارز «${cell("currency")}» در لیست ارزها نیست.`);
        continue;
      }
      const perRaw = normHeader(cell("per"));
      fixedPer = perRaw ? PER_ALIASES[perRaw] : "unit";
      if (!fixedPer) {
        err(`«به ازای» نامعتبر است: ${cell("per")} (unit/kg/shipment).`);
        continue;
      }
    } else {
      const parts = cell("base")
        .split(/[+,،/|]/)
        .map((x) => normHeader(x))
        .filter(Boolean);
      if (parts.length) {
        const mapped = parts.map((x) => BASE_ALIASES[x]);
        if (mapped.some((x) => !x)) {
          err(`پایه‌ی «${cell("base")}» نامعتبر است (goods/کالا، shipping/حمل، costs/هزینه‌ها).`);
          continue;
        }
        dutyBase = [...new Set(mapped)];
      }
    }
    const activeRaw = normHeader(cell("active"));
    const isActive = !["0", "no", "false", "خیر", "غیرفعال", "حذف"].includes(activeRaw);
    const title = String(col.title === undefined ? "" : (r[col.title] ?? "")).trim();
    rows.push({ line, code, titleFa: title ? title.slice(0, 500) : null, dutyType, dutyValue: value, dutyBase, dutyCurrency, fixedPer, isActive });
  }
  return { rows, errors, columns: Object.keys(col) };
}
