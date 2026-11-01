// اصلاح‌های انسان روی صفحه‌ی واردشده و «مقدار نهایی» (خوانده‌شده + اصلاح). docs/infoyaarchin.md بخش ۳۷.
// بدون server-only تا تست واحد مستقیم اجرایش کند. در raw_page_edits.data فقط فیلدهایی ذخیره می‌شوند که با خوانده‌شده فرق دارند؛
// پس «خواندن دوباره» فیلدهای اصلاح‌نشده را به‌روز می‌کند و اصلاح‌ها می‌مانند.
import type { AlibabaPage, LeadTier, PriceTier } from "./alibaba/parse";
import { estimateCarton, type Packing } from "./alibaba/values";

export type Dims = { l: number; w: number; h: number };
// «Quantity: 25 pieces» مبهم: در هر بسته، در هر کارتن، یا عدد دیگری برای تعداد در کارتن
export type QtyChoice = { kind: "pack" | "carton" | "other"; value: number };

export type Edits = Partial<{
  title: string | null;
  unit: string | null;
  moq: number | null;
  currency: "USD" | "CNY" | null;
  priceTiers: PriceTier[];
  leadTimes: LeadTier[];
  unitWeightKg: number | null;
  unitDimsCm: Dims | null;
  unitsPerCarton: number | null;
  cartonDimsCm: Dims | null;
  cartonWeightKg: number | null;
  hsCode: string | null;
  qtyChoice: QtyChoice | null;
}>;
export const EDIT_KEYS = [
  "title",
  "unit",
  "moq",
  "currency",
  "priceTiers",
  "leadTimes",
  "unitWeightKg",
  "unitDimsCm",
  "unitsPerCarton",
  "cartonDimsCm",
  "cartonWeightKg",
  "hsCode",
  "qtyChoice",
] as const satisfies readonly (keyof Edits)[];

export type Effective = {
  title: string | null;
  unit: string;
  moq: number | null;
  currency: "USD" | "CNY" | null;
  priceTiers: PriceTier[];
  leadTimes: LeadTier[];
  hsCode: string | null;
  // تعداد در هر بسته (از انتخاب «۲۵ عدد در هر بسته»)؛ ماشین‌حساب از آن استفاده نمی‌کند، فقط در لیستینگ ثبت می‌شود
  packQty: number | null;
  packing: Packing;
  // «Quantity» مبهم صفحه (برای نشان دادن انتخاب)
  ambiguousQty: { text: string; value: number } | null;
  edited: (keyof Edits)[];
};

// عدد «Quantity» مبهم صفحه («25 pieces» ← ۲۵)
export function ambiguousQuantity(p: AlibabaPage): { text: string; value: number } | null {
  const a = p.attributes.find((x) => /^quantity$/i.test(x.name.trim()));
  const n = a ? Number(/^\s*([\d,]+)/.exec(a.value)?.[1]?.replace(/,/g, "")) : NaN;
  return a && Number.isInteger(n) && n > 0 && !p.packing.unitsPerCarton ? { text: a.value, value: n } : null;
}

export function effective(p: AlibabaPage, e: Edits): Effective {
  const has = <K extends keyof Edits>(k: K) => Object.prototype.hasOwnProperty.call(e, k);
  const pick = <K extends keyof Edits, T>(k: K, base: T): T => (has(k) ? (e[k] as T) : base);
  // عددهای تخمینی خواننده پایه نیستند؛ تخمین از مقدارهای نهایی دوباره حساب می‌شود
  const pk = p.packing;
  let unitsPerCarton = pick("unitsPerCarton", pk.unitsPerCarton);
  let packQty: number | null = null;
  const q = e.qtyChoice ?? null;
  if (q && !has("unitsPerCarton")) {
    if (q.kind === "pack") packQty = q.value;
    else unitsPerCarton = q.value;
  }
  const packing = estimateCarton({
    unitWeightKg: pick("unitWeightKg", pk.unitWeightKg),
    unitDimsCm: pick("unitDimsCm", pk.unitDimsCm),
    unitsPerCarton,
    cartonDimsCm: pick("cartonDimsCm", pk.estimated.cartonDimsCm ? null : pk.cartonDimsCm),
    cartonWeightKg: pick("cartonWeightKg", pk.estimated.cartonWeightKg ? null : pk.cartonWeightKg),
  });
  return {
    title: pick("title", p.title),
    unit: pick("unit", p.unit) ?? "piece",
    moq: pick("moq", p.moq),
    currency: pick("currency", p.currency),
    priceTiers: pick("priceTiers", p.priceTiers),
    leadTimes: pick("leadTimes", p.leadTimes),
    hsCode: pick("hsCode", null),
    packQty,
    packing,
    ambiguousQty: ambiguousQuantity(p),
    edited: EDIT_KEYS.filter((k) => has(k)),
  };
}

// مقدار خوانده‌شده‌ی هر کلید (برای «فقط فرق‌ها ذخیره شوند»)
function baseOf(p: AlibabaPage, k: keyof Edits): unknown {
  const pk = p.packing;
  switch (k) {
    case "title":
      return p.title;
    case "unit":
      return p.unit;
    case "moq":
      return p.moq;
    case "currency":
      return p.currency;
    case "priceTiers":
      return p.priceTiers;
    case "leadTimes":
      return p.leadTimes;
    case "unitWeightKg":
      return pk.unitWeightKg;
    case "unitDimsCm":
      return pk.unitDimsCm;
    case "unitsPerCarton":
      return pk.unitsPerCarton;
    case "cartonDimsCm":
      return pk.estimated.cartonDimsCm ? null : pk.cartonDimsCm;
    case "cartonWeightKg":
      return pk.estimated.cartonWeightKg ? null : pk.cartonWeightKg;
    default:
      return null;
  }
}

// مقایسه‌ی بدون وابستگی به ترتیب کلیدها: jsonb ترتیب کلیدهای شیء را عوض می‌کند ({minQty, maxQty, price} ← {price, maxQty, minQty})
const canon = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canon).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
          .join(",")}}`
      : JSON.stringify(v ?? null);

// فقط فیلدهایی که با خوانده‌شده فرق دارند
export function diffEdits(p: AlibabaPage, next: Edits): Edits {
  const out: Edits = {};
  for (const k of EDIT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(next, k)) continue;
    const v = next[k];
    if (canon(v) !== canon(baseOf(p, k))) (out as Record<string, unknown>)[k] = v ?? null;
  }
  return out;
}
