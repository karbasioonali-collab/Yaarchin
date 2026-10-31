// تبدیل متن‌های صفحه‌ی علی‌بابا به عدد: قیمت و ارز، بازه‌ی تعداد، واحد، ابعاد و وزن، و تخمین بسته‌بندی کارتن.
// docs/infoyaarchin.md بخش ۳۵.

// «30,000» ← 30000؛ «0.04» ← 0.04
export const num = (s: string): number | null => {
  const n = Number(s.replace(/[,٬\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export type Currency = "USD" | "CNY";
// «$0.04»، «US$1.20 - 1.50»، «¥0.3»، «CN¥2»، «€1» (ارز ناشناخته ← currency: null)
export function parsePrice(s: string): { currency: Currency | null; symbol: string; min: number; max: number | null } | null {
  const t = s.replace(/\s+/g, " ").trim();
  const m = /^(US\s?\$|\$|CN¥|RMB|¥|[^\d\s.,-]{1,4})?\s*([\d.,]+)(?:\s*[-–~]\s*(?:US\s?\$|\$|CN¥|¥)?\s*([\d.,]+))?/.exec(t);
  if (!m) return null;
  const min = num(m[2]);
  if (min === null) return null;
  const sym = (m[1] ?? "").trim();
  const currency: Currency | null = /^(US\s?\$|\$)$/.test(sym) ? "USD" : /^(CN¥|RMB|¥)$/.test(sym) ? "CNY" : null;
  const max = m[3] ? num(m[3]) : null;
  return { currency, symbol: sym, min, max: max !== null && max > min ? max : null };
}

// واحدهای سایت (src/lib/format.ts ← UNITS). واحد ناشناخته همان‌طور می‌ماند و هشدار می‌گیرد.
const UNIT_MAP: Record<string, string> = {
  piece: "piece",
  pieces: "piece",
  pc: "piece",
  pcs: "piece",
  unit: "piece",
  units: "piece",
  set: "set",
  sets: "set",
  pair: "pair",
  pairs: "pair",
  kilogram: "kg",
  kilograms: "kg",
  kg: "kg",
  meter: "meter",
  meters: "meter",
  box: "box",
  boxes: "box",
  pack: "pack",
  packs: "pack",
};
export const normUnit = (raw: string): { unit: string; known: boolean } => {
  const k = raw.trim().toLowerCase().replace(/[.()]/g, "");
  return UNIT_MAP[k] ? { unit: UNIT_MAP[k], known: true } : { unit: k || "piece", known: false };
};

// «30,000-599,999 pieces»، «1 - 30,000»، «≥1,000,000 pieces»، «> 1,000,000»، «Minimum order quantity: 2,500 pieces»
export function parseQtyRange(s: string): { min: number; max: number | null; unit: string | null } | null {
  const t = s
    .replace(/\s+/g, " ")
    .replace(/^.*?:\s*/, "")
    .trim();
  const unit = /([A-Za-z]+)\s*$/.exec(t)?.[1] ?? null;
  let m = /^([\d,.]+)\s*[-–~]\s*([\d,.]+)/.exec(t);
  if (m) {
    const a = num(m[1]);
    const b = num(m[2]);
    return a !== null && b !== null ? { min: a, max: b, unit } : null;
  }
  m = /^(?:≥|>=|>|\+)?\s*([\d,.]+)/.exec(t);
  if (!m) return null;
  const a = num(m[1]);
  if (a === null) return null;
  // «> 1,000,000» یعنی از ۱٬۰۰۰٬۰۰۱
  return { min: /^>(?!=)/.test(t) ? a + 1 : a, max: null, unit };
}

// ابعاد «9X9X3.1 cm»، «20*15*10cm»، «30 x 20 x 10 mm» ← سانتی‌متر
export function parseDims(s: string): { l: number; w: number; h: number } | null {
  const m = /([\d.]+)\s*[x×*X]\s*([\d.]+)\s*[x×*X]\s*([\d.]+)\s*(mm|cm|m|inch|in)?\b/i.exec(s);
  if (!m) return null;
  const f = { mm: 0.1, cm: 1, m: 100, inch: 2.54, in: 2.54 }[(m[4] ?? "cm").toLowerCase() as "cm"] ?? 1;
  const v = [m[1], m[2], m[3]].map((x) => Math.round(Number(x) * f * 10) / 10);
  return v.every((x) => x > 0) ? { l: v[0], w: v[1], h: v[2] } : null;
}

// وزن «0.005 kg»، «150g»، «1.2 lbs» ← کیلوگرم
export function parseWeight(s: string): number | null {
  const m = /([\d.]+)\s*(kg|kgs|kilograms?|g|grams?|gram|lbs?|pounds?)\b/i.exec(s);
  if (!m) return null;
  const u = m[2].toLowerCase();
  const f = u.startsWith("k") ? 1 : u.startsWith("g") ? 0.001 : 0.4536;
  const v = Math.round(Number(m[1]) * f * 100000) / 100000;
  return v > 0 ? v : null;
}

// «100 pcs/carton»، «50 pieces per carton»، «Packing: 200pcs/ctn» ← تعداد در کارتن
export function parsePerCarton(s: string): number | null {
  const m = /([\d,]+)\s*(?:pcs|pieces|units|sets|pairs)?\s*(?:\/|per|in\s+(?:one|a|each|1))\s*(?:export\s+)?(?:carton|ctn|ctns|cartons|box\b)/i.exec(s);
  const n = m ? num(m[1]) : null;
  return n && n > 0 && Number.isInteger(n) ? n : null;
}

export type Packing = {
  unitWeightKg: number | null;
  unitDimsCm: { l: number; w: number; h: number } | null;
  unitsPerCarton: number | null;
  cartonDimsCm: { l: number; w: number; h: number } | null;
  cartonWeightKg: number | null;
  // کدام عددها تخمینی‌اند (از روی عدد تکی و تعداد در کارتن)؛ انسان در صفحه‌ی بررسی تأیید یا اصلاح می‌کند
  estimated: { cartonWeightKg: boolean; cartonDimsCm: boolean };
};

// فضای خالی و جنس کارتن در تخمین ابعاد (۱۰٪)
export const CARTON_SLACK = 1.1;

// تخمین کارتن وقتی خود صفحه نگفته ولی تکی و تعداد در کارتن معلوم است:
//   وزن کارتن ≈ وزن تکی × تعداد؛
//   ابعاد کارتن ≈ مکعبی هم‌حجم با «حجم تکی × تعداد × ۱٫۱». وزن حجمی ماشین‌حساب فقط به حجم بستگی دارد، پس همین کافی است.
export function estimateCarton(p: Omit<Packing, "estimated">): Packing {
  const out: Packing = { ...p, estimated: { cartonWeightKg: false, cartonDimsCm: false } };
  const n = p.unitsPerCarton;
  if (!n) return out;
  if (out.cartonWeightKg === null && p.unitWeightKg !== null) {
    out.cartonWeightKg = Math.round(p.unitWeightKg * n * 1000) / 1000;
    out.estimated.cartonWeightKg = true;
  }
  if (out.cartonDimsCm === null && p.unitDimsCm) {
    const vol = p.unitDimsCm.l * p.unitDimsCm.w * p.unitDimsCm.h * n * CARTON_SLACK;
    const side = Math.round(Math.cbrt(vol) * 10) / 10;
    out.cartonDimsCm = { l: side, w: side, h: side };
    out.estimated.cartonDimsCm = true;
  }
  return out;
}
