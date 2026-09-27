// ماشین‌حساب قیمت تمام‌شده تا ایران — بخش «خالص»: فقط از ورودی‌هایش حساب می‌کند و به دیتابیس دست نمی‌زند.
// ورودی‌ها: RateSnapshot (همه‌ی نرخ‌ها و نسخه‌های معتبر در یک لحظه؛ snapshot.ts) و LandedInput (قیمت‌ها و بسته‌بندی محصول).
// پیش‌فاکتور آینده همین دو را به‌شکل JSON نگه می‌دارد و هر وقت لازم شد دوباره همین تابع را صدا می‌زند؛ پس نرخ‌های
// لحظه‌ی صدور «منجمد» می‌مانند (docs/infoyaarchin.md بخش ۲۱).
//
// ترتیب: کالا ← حمل ← بیمه و هزینه‌ها ← حقوق ورودی ← ارزش افزوده ← جمع. هر بخش که اطلاعاتش نیست null می‌شود و دلیلش
// در missing می‌آید؛ جمع کل فقط وقتی عدد دارد که همه‌ی بخش‌ها عدد داشته باشند (عدد ساختگی یا ناقص نشان داده نمی‌شود).
//
// «کیسه‌ی ارز» (Bag): مبلغ‌ها تا آخرین لحظه به ارز خودشان نگه داشته می‌شوند ({USD: 120, CNY: 300, IRT: 50000}) تا
// هم با نرخ بازار (برای نمایش) و هم با نرخ گمرکی (برای پایه‌ی حقوق ورودی و ارزش افزوده) قابل تبدیل باشند.
import { compileFormula, FormulaError, VARIABLES } from "./formula";

export const BASE = "IRT"; // تومان

export type Bag = Record<string, number>;
export type RateInfo = { id: number; rate: number; date: string };
export type ShippingRule = {
  versionId: number | null;
  key: string;
  nameFa: string;
  sortOrder: number;
  isActive: boolean;
  ratePerKg: number | null;
  ratePerCbm: number | null;
  volumetricFactor: number | null;
  minCharge: number | null;
  currency: string | null;
  transitMinDays: number | null;
  transitMaxDays: number | null;
};
export type CostRule = {
  versionId: number;
  itemId: string;
  nameFa: string;
  calcType: "fixed" | "percent" | "per_kg" | "per_cbm" | "formula";
  amount: number | null;
  percentBase: ("goods" | "shipping")[] | null;
  formula: string | null;
  currency: string | null;
  methods: string[] | null;
};
export type HsRule = {
  versionId: number;
  code: string;
  titleFa: string | null;
  isActive: boolean;
  dutyType: "percent" | "fixed";
  dutyValue: number;
  dutyBase: ("goods" | "shipping" | "costs")[] | null;
  dutyCurrency: string | null;
  fixedPer: "unit" | "kg" | "shipment" | null;
};
export type TaxRule = { versionId: number; vatPercent: number; vatBase: ("goods" | "shipping" | "costs" | "duty")[]; customsRateFor: ("duty" | "vat")[] };

export type RateSnapshot = {
  takenAt: string;
  today: string; // تاریخ تهران در لحظه‌ی عکس (YYYY-MM-DD)
  currencies: Record<string, { nameFa: string; isBase: boolean }>;
  market: Record<string, RateInfo>;
  customs: Record<string, RateInfo>;
  shipping: ShippingRule[];
  costs: CostRule[];
  tax: TaxRule | null;
  hs: Record<string, HsRule>;
};

export type QtyTier = { minQty: number | null; maxQty: number | null };
export type PriceBatchIn = { currency: string; observedAt: string; tiers: (QtyTier & { priceMin: number; priceMax: number | null })[] };
export type ListingIn = { companyId: string; moq: number | null; prices: PriceBatchIn[]; leadTiers: (QtyTier & { days: number })[] | null; leadDaysLegacy: number | null };
export type Packing = {
  unitWeightKg: number | null;
  cartonLengthCm: number | null;
  cartonWidthCm: number | null;
  cartonHeightCm: number | null;
  cartonWeightKg: number | null;
  unitsPerCarton: number | null;
};
export type LandedInput = { productId: string; qty: number; priceUnit: string; hsCode: string | null; packing: Packing; listings: ListingIn[] };

export type Line = { label: string; formula: string; toman: number | null; note?: string };
export type Part = { toman: number | null; bag: Bag | null; missing: string[]; lines: Line[] };
export type MethodResult = {
  key: string;
  nameFa: string;
  isActive: boolean;
  status: "ok" | "inquiry";
  missing: string[];
  goods: number | null;
  shipping: number | null;
  costs: number | null;
  duty: number | null;
  vat: number | null;
  total: number | null;
  unit: number | null;
  days: { min: number; max: number } | null;
  lines: { section: "goods" | "shipping" | "costs" | "duty" | "vat" | "total"; line: Line }[];
};
export type LandedResult = {
  qty: number;
  moq: number | null;
  belowMoq: boolean;
  suppliers: number;
  leadDays: number | null;
  packing: { cartons: number | null; weightKg: number | null; volumeCbm: number | null; missing: string[] };
  goods: Part;
  hs: HsRule | null;
  ratesUsed: { currency: string; kind: "market" | "customs"; rate: number; date: string }[];
  ratesDate: string | null; // قدیمی‌ترین تاریخ نرخ بازارِ استفاده‌شده
  ratesStale: boolean; // نرخ یکی از ارزها مال امروز نیست
  customsFallback: string[]; // ارزهایی که نرخ گمرکی نداشتند و با نرخ بازار حساب شدند
  methods: MethodResult[];
};

// ---------- کمکی‌ها ----------
const fa = (n: number, digits = 2) => n.toLocaleString("fa-IR", { maximumFractionDigits: digits });
const addBag = (a: Bag, b: Bag): Bag => {
  const o = { ...a };
  for (const [k, v] of Object.entries(b)) o[k] = (o[k] ?? 0) + v;
  return o;
};
const scaleBag = (a: Bag, f: number): Bag => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v * f]));
const bagText = (b: Bag, names: RateSnapshot["currencies"]) =>
  Object.entries(b)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${fa(v)} ${names[k]?.nameFa ?? k}`)
    .join(" + ") || "۰";

// پله‌ی متناسب با تعداد: بزرگ‌ترین «از» که ≤ تعداد باشد (و «تا»ی آن تعداد را بپوشاند)؛ اگر تعداد از همه‌ی پله‌ها کمتر است، پله‌ی اول.
export function pickTier<T extends QtyTier>(tiers: T[], qty: number): { tier: T; below: boolean } | null {
  if (!tiers.length) return null;
  const sorted = [...tiers].sort((a, b) => (a.minQty ?? 1) - (b.minQty ?? 1));
  const cover = sorted.filter((t) => (t.minQty ?? 1) <= qty && (t.maxQty === null || qty <= t.maxQty));
  if (cover.length) return { tier: cover.at(-1)!, below: false };
  const under = sorted.filter((t) => (t.minQty ?? 1) <= qty);
  if (under.length) return { tier: under.at(-1)!, below: false }; // تعداد بین دو پله (فاصله‌ی ثبت‌نشده)
  return { tier: sorted[0], below: true };
}

class Converter {
  used = new Map<string, { currency: string; kind: "market" | "customs"; rate: number; date: string }>();
  fallback = new Set<string>();
  constructor(private s: RateSnapshot) {}
  rate(cur: string, kind: "market" | "customs"): number | null {
    if (cur === BASE) return 1;
    if (kind === "customs") {
      const c = this.s.customs[cur];
      if (c) {
        this.used.set(`${cur}:customs`, { currency: cur, kind, rate: c.rate, date: c.date });
        return c.rate;
      }
      this.fallback.add(cur);
    }
    const m = this.s.market[cur];
    if (!m) return null;
    this.used.set(`${cur}:market`, { currency: cur, kind: "market", rate: m.rate, date: m.date });
    return m.rate;
  }
  // null اگر نرخ یکی از ارزها نباشد
  toman(b: Bag, kind: "market" | "customs"): number | null {
    let t = 0;
    for (const [cur, v] of Object.entries(b)) {
      if (!v) continue;
      const r = this.rate(cur, kind);
      if (r === null) return null;
      t += v * r;
    }
    return t;
  }
  missingRates(b: Bag): string[] {
    return Object.keys(b).filter((c) => c !== BASE && b[c] && !this.s.market[c]);
  }
}

const rateMissingText = (curs: string[], s: RateSnapshot) => `نرخ ${curs.map((c) => s.currencies[c]?.nameFa ?? c).join(" و ")} ثبت نشده`;

// ---------- محاسبه ----------
export function computeLanded(input: LandedInput, s: RateSnapshot): LandedResult {
  const qty = input.qty;
  const conv = new Converter(s);
  const names = s.currencies;

  // ۱) قیمت کالا: هر لیستینگ ← آخرین نوبت قیمتی که نرخ ارزش ثبت شده، پله‌ی متناسب با تعداد، وسط بازه.
  //    فقط کارخانه‌هایی که این تعداد را می‌پذیرند (تعداد ≥ حداقل سفارش و ≥ «از»ِ پله‌ی اول)؛ اگر هیچ‌کدام نپذیرد،
  //    همه با پله‌ی اولشان و علامت belowMoq. هر کارخانه یک رأی (میانگین لیستینگ‌هایش)، بعد میانگین کارخانه‌ها.
  const goodsLines: Line[] = [];
  const goodsMissing: string[] = [];
  const noRate = new Set<string>();
  type Offer = { companyId: string; bag: Bag; accepts: boolean; listing: ListingIn };
  const offers: Offer[] = [];
  for (const l of input.listings) {
    const usable = l.prices.filter((b) => b.tiers.length && (b.currency === BASE || s.market[b.currency]));
    for (const b of l.prices) if (b.currency !== BASE && !s.market[b.currency]) noRate.add(b.currency);
    const batch = usable.sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
    if (!batch) continue;
    const pick = pickTier(batch.tiers, qty)!;
    const mid = (pick.tier.priceMin + (pick.tier.priceMax ?? pick.tier.priceMin)) / 2;
    offers.push({ companyId: l.companyId, bag: { [batch.currency]: mid }, accepts: !pick.below && (l.moq === null || qty >= l.moq), listing: l });
  }
  const accepting = offers.filter((o) => o.accepts);
  const belowMoq = offers.length > 0 && !accepting.length;
  const used = accepting.length ? accepting : offers;
  const perCompany = new Map<string, Bag[]>();
  for (const o of used) perCompany.set(o.companyId, [...(perCompany.get(o.companyId) ?? []), o.bag]);
  const moqs = input.listings.map((l) => l.moq).filter((m): m is number => m !== null);
  const moq = moqs.length ? Math.min(...moqs) : null;

  let unitBag: Bag | null = null;
  if (perCompany.size) {
    unitBag = {};
    for (const bags of perCompany.values()) unitBag = addBag(unitBag, scaleBag(bags.reduce(addBag, {}), 1 / bags.length));
    unitBag = scaleBag(unitBag, 1 / perCompany.size);
  } else if (input.listings.some((l) => l.prices.length) && noRate.size) {
    goodsMissing.push(rateMissingText([...noRate], s));
  } else {
    goodsMissing.push("قیمت کارخانه ثبت نشده");
  }
  const goodsBag = unitBag ? scaleBag(unitBag, qty) : null;
  const goodsToman = goodsBag ? conv.toman(goodsBag, "market") : null;
  if (unitBag && goodsToman !== null) {
    const skipped = new Set(offers.filter((o) => !used.includes(o)).map((o) => o.companyId)).size;
    goodsLines.push({
      label: "قیمت هر عدد",
      formula:
        `میانگین ${fa(perCompany.size, 0)} کارخانه (پله‌ی متناسب با ${fa(qty, 0)} عدد، وسط بازه): ${bagText(unitBag, names)}` +
        (skipped ? ` — ${fa(skipped, 0)} کارخانه با حداقل سفارش بیشتر حساب نشد` : "") +
        (belowMoq ? " — تعداد کمتر از حداقل سفارش همه‌ی کارخانه‌ها؛ پله‌ی اول" : ""),
      toman: goodsToman / qty,
    });
    goodsLines.push({ label: "ارزش کالا", formula: `قیمت هر عدد × ${fa(qty, 0)} (با نرخ بازار)`, toman: goodsToman });
  }
  const goods: Part = { toman: goodsToman, bag: goodsBag, missing: goodsMissing, lines: goodsLines };

  // ۲) زمان آماده‌سازی: پله‌ی متناسب با تعداد در آخرین نوبت هر لیستینگ (یا مقدار قدیمی lead_time_days)؛ همان لیستینگ‌هایی
  //    که در قیمت حساب شدند (اگر قیمتی نبود، همه). میانگین کارخانه‌ها، رو به بالا.
  const leadPerCompany = new Map<string, number[]>();
  for (const l of used.length ? used.map((o) => o.listing) : input.listings) {
    const t = l.leadTiers?.length ? pickTier(l.leadTiers, qty)!.tier.days : l.leadDaysLegacy;
    if (t == null) continue;
    leadPerCompany.set(l.companyId, [...(leadPerCompany.get(l.companyId) ?? []), t]);
  }
  const leadAvg = [...leadPerCompany.values()].map((d) => d.reduce((a, b) => a + b, 0) / d.length);
  const leadDays = leadAvg.length ? Math.ceil(leadAvg.reduce((a, b) => a + b, 0) / leadAvg.length) : null;

  // ۳) بسته‌بندی: تعداد کارتن = سقف(تعداد ÷ تعداد در کارتن)؛ وزن از وزن کارتن (یا وزن هر عدد)؛ حجم از ابعاد کارتن.
  const k = input.packing;
  const packMissing: string[] = [];
  const cartons = k.unitsPerCarton ? Math.ceil(qty / k.unitsPerCarton) : null;
  if (!k.unitsPerCarton) packMissing.push("تعداد در کارتن");
  const volumeCbm = cartons !== null && k.cartonLengthCm && k.cartonWidthCm && k.cartonHeightCm ? (cartons * k.cartonLengthCm * k.cartonWidthCm * k.cartonHeightCm) / 1e6 : null;
  if (!(k.cartonLengthCm && k.cartonWidthCm && k.cartonHeightCm)) packMissing.push("ابعاد کارتن");
  const weightKg = cartons !== null && k.cartonWeightKg ? cartons * k.cartonWeightKg : k.unitWeightKg ? qty * k.unitWeightKg : null;
  if (!k.cartonWeightKg && !k.unitWeightKg) packMissing.push("وزن کارتن یا وزن هر عدد");
  const packingOk = weightKg !== null && volumeCbm !== null;
  const packMsg = packMissing.length ? `اطلاعات بسته‌بندی محصول ناقص است (${packMissing.join("، ")})` : null;

  // HS
  const hs = input.hsCode ? (s.hs[input.hsCode] ?? null) : null;
  const hsMissing = !input.hsCode ? "HS code محصول ثبت نشده" : !hs || !hs.isActive ? `HS code ${input.hsCode} در لیست HS نیست` : null;

  const methods: MethodResult[] = [];
  for (const m of [...s.shipping].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const lines: MethodResult["lines"] = [];
    const missing = new Set<string>(goods.missing);
    for (const l of goods.lines) lines.push({ section: "goods", line: l });

    // حمل
    let shipBag: Bag | null = null;
    let chargeable: number | null = null;
    if (!packingOk) missing.add(packMsg ?? "اطلاعات بسته‌بندی محصول ناقص است");
    else if (!m.currency || (m.ratePerKg === null && m.ratePerCbm === null)) missing.add(`نرخ حمل ${m.nameFa} ثبت نشده`);
    else {
      chargeable = m.volumetricFactor ? Math.max(weightKg!, volumeCbm! * m.volumetricFactor) : weightKg!;
      const raw = chargeable * (m.ratePerKg ?? 0) + volumeCbm! * (m.ratePerCbm ?? 0);
      const cost = m.minCharge !== null && raw < m.minCharge ? m.minCharge : raw;
      shipBag = { [m.currency]: cost };
      lines.push({
        section: "shipping",
        line: {
          label: "وزن قابل‌محاسبه",
          formula: m.volumetricFactor
            ? `بیشترِ وزن واقعی ${fa(weightKg!)} کیلو و حجم ${fa(volumeCbm!, 3)} م³ × ضریب ${fa(m.volumetricFactor)} = ${fa(chargeable)} کیلو`
            : `وزن واقعی (ضریب حجمی ثبت نشده) = ${fa(chargeable)} کیلو`,
          toman: null,
        },
      });
    }
    const shipMissingRate = shipBag ? conv.missingRates(shipBag) : [];
    if (shipMissingRate.length) missing.add(rateMissingText(shipMissingRate, s));
    const shipToman = shipBag && !shipMissingRate.length ? conv.toman(shipBag, "market") : null;
    if (shipBag && shipToman !== null) {
      lines.push({ section: "shipping", line: { label: `حمل ${m.nameFa}`, formula: describeShip(m, chargeable!, volumeCbm!, names), toman: shipToman } });
    }

    // بیمه و هزینه‌های دیگر (هرکدام به ارز خودش؛ درصدی = درصد از کیسه‌ی پایه)
    let costsBag: Bag | null = {};
    for (const c of s.costs) {
      if (c.methods && !c.methods.includes(m.key)) continue;
      const r = costFor(c, { goodsBag, shipBag, weightKg, volumeCbm, chargeable, qty, cartons }, conv, s);
      if ("missing" in r) {
        missing.add(`${c.nameFa}: ${r.missing}`);
        costsBag = null;
        lines.push({ section: "costs", line: { label: c.nameFa, formula: r.missing, toman: null } });
        continue;
      }
      if (costsBag) costsBag = addBag(costsBag, r.bag);
      lines.push({ section: "costs", line: { label: c.nameFa, formula: r.formula, toman: conv.toman(r.bag, "market") } });
    }
    const costsToman = costsBag ? conv.toman(costsBag, "market") : null;

    // حقوق ورودی
    const dutyKind = s.tax?.customsRateFor.includes("duty") ? "customs" : "market";
    let dutyToman: number | null = null;
    if (hsMissing) missing.add(hsMissing);
    else if (hs) {
      if (hs.dutyType === "percent") {
        const base = hs.dutyBase?.length ? hs.dutyBase : (["goods", "shipping", "costs"] as const);
        const bags = { goods: goodsBag, shipping: shipBag, costs: costsBag };
        if (base.every((b) => bags[b])) {
          const baseToman = conv.toman(base.map((b) => bags[b]!).reduce(addBag, {}), dutyKind);
          if (baseToman !== null) {
            dutyToman = (baseToman * hs.dutyValue) / 100;
            lines.push({
              section: "duty",
              line: {
                label: `حقوق ورودی (HS ${hs.code})`,
                formula: `${fa(hs.dutyValue)}٪ × (${base.map((b) => SECTION_FA[b]).join(" + ")} = ${fa(Math.round(baseToman), 0)} تومان با نرخ ${dutyKind === "customs" ? "گمرکی" : "بازار"})`,
                toman: dutyToman,
              },
            });
          }
        } else missing.add("پایه‌ی حقوق ورودی کامل نیست");
      } else {
        const per = hs.fixedPer ?? "shipment";
        const mult = per === "unit" ? qty : per === "kg" ? weightKg : 1;
        const cur = hs.dutyCurrency ?? BASE;
        const r = conv.rate(cur, dutyKind);
        if (mult === null) missing.add(packMsg ?? "وزن محصول معلوم نیست");
        else if (r === null) missing.add(rateMissingText([cur], s));
        else {
          dutyToman = hs.dutyValue * mult * r;
          lines.push({
            section: "duty",
            line: {
              label: `حقوق ورودی (HS ${hs.code})`,
              formula: `${fa(hs.dutyValue)} ${names[cur]?.nameFa ?? cur} × ${PER_FA[per]}${per === "shipment" ? "" : ` (${fa(mult)})`}`,
              toman: dutyToman,
            },
          });
        }
      }
    }

    // ارزش افزوده (جدا از حقوق ورودی)
    let vatToman: number | null = null;
    if (!s.tax) missing.add("درصد مالیات ارزش افزوده ثبت نشده");
    else {
      const vatKind = s.tax.customsRateFor.includes("vat") ? "customs" : "market";
      const bags = { goods: goodsBag, shipping: shipBag, costs: costsBag };
      let base: number | null = 0;
      for (const b of s.tax.vatBase) {
        if (b === "duty") base = dutyToman === null || base === null ? null : base + dutyToman;
        else {
          const t = bags[b] ? conv.toman(bags[b]!, vatKind) : null;
          base = t === null || base === null ? null : base + t;
        }
      }
      if (base === null) missing.add("پایه‌ی ارزش افزوده کامل نیست");
      else {
        vatToman = (base * s.tax.vatPercent) / 100;
        lines.push({
          section: "vat",
          line: {
            label: "مالیات ارزش افزوده",
            formula: `${fa(s.tax.vatPercent)}٪ × (${s.tax.vatBase.map((b) => SECTION_FA[b]).join(" + ")} = ${fa(Math.round(base), 0)} تومان${s.tax.vatBase.some((b) => b !== "duty") ? ` با نرخ ${vatKind === "customs" ? "گمرکی" : "بازار"}` : ""})`,
            toman: vatToman,
          },
        });
      }
    }

    const all = [goodsToman, shipToman, costsToman, dutyToman, vatToman];
    const total = missing.size || all.some((x) => x === null) ? null : all.reduce((a, b) => a! + b!, 0)!;
    if (total !== null) lines.push({ section: "total", line: { label: "جمع کل", formula: "کالا + حمل + بیمه و هزینه‌ها + حقوق ورودی + ارزش افزوده", toman: total } });
    const days = leadDays !== null && m.transitMinDays !== null ? { min: leadDays + m.transitMinDays, max: leadDays + (m.transitMaxDays ?? m.transitMinDays) } : null;
    methods.push({
      key: m.key,
      nameFa: m.nameFa,
      isActive: m.isActive,
      status: total === null ? "inquiry" : "ok",
      missing: [...missing],
      goods: goodsToman,
      shipping: shipToman,
      costs: costsToman,
      duty: dutyToman,
      vat: vatToman,
      total,
      unit: total === null ? null : total / qty,
      days,
      lines,
    });
  }

  const ratesUsed = [...conv.used.values()];
  const marketDates = ratesUsed.filter((r) => r.kind === "market").map((r) => r.date);
  const ratesDate = marketDates.length ? marketDates.sort()[0] : null;
  return {
    qty,
    moq,
    belowMoq,
    suppliers: perCompany.size,
    leadDays,
    packing: { cartons, weightKg, volumeCbm, missing: packMissing },
    goods,
    hs,
    ratesUsed,
    ratesDate,
    ratesStale: ratesDate !== null && ratesDate < s.today,
    customsFallback: [...conv.fallback],
    methods,
  };
}

export const SECTION_FA: Record<string, string> = { goods: "ارزش کالا", shipping: "هزینه‌ی حمل", costs: "بیمه و هزینه‌ها", duty: "حقوق ورودی" };
export const PER_FA: Record<string, string> = { unit: "هر عدد", kg: "هر کیلو", shipment: "کل محموله" };

function describeShip(m: ShippingRule, chargeable: number, volume: number, names: RateSnapshot["currencies"]): string {
  const cur = names[m.currency!]?.nameFa ?? m.currency;
  const parts = [m.ratePerKg !== null ? `${fa(chargeable)} کیلو × ${fa(m.ratePerKg)}` : null, m.ratePerCbm !== null ? `${fa(volume, 3)} م³ × ${fa(m.ratePerCbm)}` : null].filter(
    Boolean,
  );
  const raw = chargeable * (m.ratePerKg ?? 0) + volume * (m.ratePerCbm ?? 0);
  const min = m.minCharge !== null && raw < m.minCharge ? ` ← کمتر از حداقل؛ حداقل هزینه ${fa(m.minCharge)} ${cur}` : ` = ${fa(raw)} ${cur}`;
  return `${parts.join(" + ")}${min}`;
}

type CostCtx = { goodsBag: Bag | null; shipBag: Bag | null; weightKg: number | null; volumeCbm: number | null; chargeable: number | null; qty: number; cartons: number | null };

function costFor(c: CostRule, x: CostCtx, conv: Converter, s: RateSnapshot): { bag: Bag; formula: string } | { missing: string } {
  const cur = c.currency ?? BASE;
  const curFa = s.currencies[cur]?.nameFa ?? cur;
  if (c.currency && c.currency !== BASE && !s.market[c.currency]) return { missing: rateMissingText([c.currency], s) };
  const amt = c.amount ?? 0;
  switch (c.calcType) {
    case "fixed":
      return { bag: { [cur]: amt }, formula: `مبلغ ثابت ${fa(amt)} ${curFa}` };
    case "percent": {
      const base = c.percentBase?.length ? c.percentBase : (["goods"] as const);
      const bags = base.map((b) => (b === "goods" ? x.goodsBag : x.shipBag));
      if (bags.some((b) => !b)) return { missing: `پایه (${base.map((b) => SECTION_FA[b]).join(" + ")}) معلوم نیست` };
      return {
        bag: scaleBag(
          bags.reduce<Bag>((a, b) => addBag(a, b!), {}),
          amt / 100,
        ),
        formula: `${fa(amt)}٪ × (${base.map((b) => SECTION_FA[b]).join(" + ")})`,
      };
    }
    case "per_kg":
      if (x.weightKg === null) return { missing: "وزن محصول معلوم نیست" };
      return { bag: { [cur]: amt * x.weightKg }, formula: `${fa(amt)} ${curFa} × ${fa(x.weightKg)} کیلو` };
    case "per_cbm":
      if (x.volumeCbm === null) return { missing: "حجم محصول معلوم نیست" };
      return { bag: { [cur]: amt * x.volumeCbm }, formula: `${fa(amt)} ${curFa} × ${fa(x.volumeCbm, 3)} م³` };
    case "formula": {
      try {
        const f = compileFormula(c.formula ?? "");
        const r = conv.rate(cur, "market")!;
        const inCur = (b: Bag | null) => {
          if (!b) return null;
          const t = conv.toman(b, "market");
          return t === null ? null : t / r;
        };
        const vars = {
          goods_value: inCur(x.goodsBag),
          shipping: inCur(x.shipBag),
          weight: x.weightKg,
          chargeable_weight: x.chargeable,
          volume: x.volumeCbm,
          qty: x.qty,
          cartons: x.cartons,
        };
        const missingVar = f.vars.find((v) => vars[v] == null);
        if (missingVar) return { missing: `«${VARIABLES[missingVar].fa}» معلوم نیست` };
        const v = f.evaluate(vars);
        return { bag: { [cur]: v }, formula: `${c.formula} = ${fa(v)} ${curFa}` };
      } catch (e) {
        if (e instanceof FormulaError) return { missing: `فرمول: ${e.message}` };
        throw e;
      }
    }
  }
}

// ---------- خروجی عمومی سایت ----------
// فقط عددهای گردشده (نزدیک‌ترین ۱٬۰۰۰ تومان) و بدون ریز محاسبه؛ اسم یا قیمت تک‌تک کارخانه‌ها هرگز در آن نیست.
export type PublicLanded = {
  qty: number;
  moq: number | null;
  belowMoq: boolean;
  ratesDate: string | null;
  methods: { key: string; nameFa: string; status: "ok" | "inquiry"; unit: number | null; total: number | null; days: { min: number; max: number } | null }[];
};
export const round1000 = (n: number) => Math.max(1000, Math.round(n / 1000) * 1000);

export function toPublic(r: LandedResult): PublicLanded {
  return {
    qty: r.qty,
    moq: r.moq,
    belowMoq: r.belowMoq,
    ratesDate: r.ratesDate,
    methods: r.methods
      .filter((m) => m.isActive)
      .map((m) => ({
        key: m.key,
        nameFa: m.nameFa,
        status: m.status,
        unit: m.unit === null ? null : round1000(m.unit),
        total: m.total === null ? null : round1000(m.total),
        days: m.days,
      })),
  };
}
