// «نشانه»های جدیت مشتری از گفتگو (دستیار PR ۳). docs/infoyaarchin.md بخش ۴۳.
// خالص، بدون import با «@/» (تست واحد مستقیم اجرایش می‌کند).
//   ۴ نوع (کلید customer_signals):
//     order_qty          تعداد سفارش (کد از متن مشتری؛ اگر کد نگرفت، از خط signals مدل)
//     budget_mtoman      سرمایه/بودجه به میلیون تومان (فقط مدل؛ تبدیل واحد با کد)
//     budget_unclear     بودجه‌ی مبهم («۲۰۰ تومن» بدون هزار/میلیون/میلیارد): فقط نمایش، هیچ قانون امتیازی رویش نیست
//     import_experience  سابقه‌ی واردات (۱ = دارد، ۰ = ندارد)
//     sales_channel      کانال فروش (۱؛ اسم کانال در value_text)
//   فقط حرف صریح مشتری در همان پیام؛ خط «signals:» فقط از جواب مدل خوانده می‌شود، هرگز از متن مشتری.
import { normFa } from "../ai/normalize";

export const SIGNAL_KEYS = ["order_qty", "budget_mtoman", "budget_unclear", "import_experience", "sales_channel"] as const;
export type SignalKey = (typeof SIGNAL_KEYS)[number];

export const CHANNEL_FA: Record<string, string> = {
  shop: "مغازه / فروشگاه حضوری",
  online: "فروش اینترنتی",
  wholesale: "عمده‌فروشی / پخش",
  company: "مصرف شرکت یا کارگاه خودش",
  other: "کانال دیگر",
};
export const SIGNAL_FA: Record<SignalKey, string> = {
  order_qty: "تعداد سفارش",
  budget_mtoman: "سرمایه / بودجه",
  budget_unclear: "سرمایه / بودجه (مبهم)",
  import_experience: "سابقه‌ی واردات",
  sales_channel: "کانال فروش",
};

// یک نشانه‌ی آماده‌ی ذخیره
export type Signal = {
  key: SignalKey;
  valueNum: number | null;
  valueText: string;
  confidence: number;
  // qty_code = تعداد با کد | ai = خط signals مدل
  via: "code" | "ai";
  // سؤال قیمت برای یک تعداد («اگه ۱۰۰۰ تا بگیرم چند میشه؟»)
  priceQuestion?: boolean;
  // کد کانال فروش (shop | online | …) برای sales_channel
  channel?: string;
};

// ---------- تعداد با کد ----------
// سخت‌گیرتر از extractQty ماشین‌حساب (بخش ۴۴):
//   عدد + واحد شمارش (عدد، دونه، کارتن، جفت، ست، بسته، pcs، …) ← تعداد، بدون نیاز به فعل
//   عدد + «تا» (یا «هزار/میلیون» بدون واحد) ← فقط اگر فعل خرید/نیاز با حداکثر ۳ کلمه فاصله، داخل همان جمله بیاید
//     («۱۰۰۰ تا بگیرم»، «۵۰۰ تا مخلوط‌کن می‌خوام»، «۵۰۰ تا از این مخلوط‌کن می‌خوام»). مرز جمله: : ؟ ? ، , . ! ؛ و خط تازه
//     ← «۲ تا سؤال دارم: حداقل سفارش …» تعداد نیست («سفارش» در جمله‌ی بعد است).
//   کنار تومان/دلار/ریال/درصد/روز/…، یا عدد تلفن، حساب نمی‌شود.
// نیم‌فاصله قبل از normFa حذف می‌شود («مخلوط‌کن» یک کلمه بماند، «می‌خوام» ← «میخوام»).
const UNIT = "(?:عدد|دونه|دانه|کارتن|جفت|ست|بسته|پیس|piece|pieces|pcs|pc|unit|units)";
const SCALE = "(?:هزار|k|میلیون)";
const BUY =
  /(میخوام|میخواهم|می خوام|می خواهم|لازم دارم|لازم داریم|لازمه|لازم است|نیاز دارم|نیاز داریم|میخوایم|می خوایم|سفارش|خرید|بخرم|بخریم|بگیرم|بگیریم|وارد کنم|وارد کنیم|میگیرم|می گیرم|احتیاج)/;
const PRICE_Q = /(چند|چقدر|قیمت|هزینه|درمیاد|در میاد|میشه|می شه|تموم میشه)/;
const NOT_QTY = /^\s*(تومان|تومن|ریال|دلار|یوان|درصد|٪|%|روز|هفته|ماه|سال|ساعت|دقیقه|کیلو|گرم|متر|سانت|بار|دفعه|مرتبه|نفر)/;
const SENTENCE_END = /[:：؟?،,.!؛;\n]/;
const MAX_GAP_WORDS = 3;

// فعل خرید با حداکثر ۳ کلمه فاصله در همان جمله؟
function buyVerbNear(rest: string): boolean {
  const clause = rest.split(SENTENCE_END)[0];
  const m = BUY.exec(clause);
  return !!m && clause.slice(0, m.index).trim().split(/\s+/).filter(Boolean).length <= MAX_GAP_WORDS;
}

// متن یکسان‌شده برای تعداد: نیم‌فاصله حذف، رقم لاتین، بدون جداکننده‌ی هزارگان، بدون تلفن
function qtyText(text: string): string {
  const n = normFa(text.replace(/\u200c/g, ""))
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/٬/g, "");
  return n.replace(/\+?\d{8,}/g, " ");
}

// تعدادِ خط signals مدل فقط وقتی پذیرفته می‌شود که همان عدد در متن مشتری «چسبیده» باشد (بخش ۴۵):
//   بلافاصله بعدش واحد شمارش، یا بعد از «تا» فعل خرید با حداکثر ۳ کلمه فاصله در همان جمله،
//   یا خود عدد و بعد فعل خرید با حداکثر ۳ کلمه فاصله («۵۰۰ می‌خوام»؛ فقط برای تأیید عدد مدل — کد خودش این را
//   نمی‌خواند، چون «ساعت ۵ می‌خوام بیام» را اشتباه می‌گرفت). «۲ تا سؤال دارم: حداقل سفارش …» ← رد.
export function qtyAttached(customerText: string, qty: number): boolean {
  const clean = qtyText(customerText);
  const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${SCALE})?(?![\\d.])`, "gu");
  for (const m of clean.matchAll(re)) {
    const [whole, numRaw, scale] = m;
    let v = Number(numRaw);
    if (scale === "هزار" || scale === "k") v *= 1000;
    if (scale === "میلیون") v *= 1_000_000;
    if (Math.round(v) !== qty) continue;
    const rest = clean.slice((m.index ?? 0) + whole.length);
    if (NOT_QTY.test(rest)) continue;
    if (new RegExp(`^\\s*${UNIT}(?![\\p{L}])`, "u").test(rest)) return true;
    const ta = /^\s*تا(?![\p{L}])/u.exec(rest);
    if (buyVerbNear(ta ? rest.slice(ta[0].length) : rest)) return true;
  }
  return false;
}

export function extractOrderQty(text: string): { qty: number; priceQuestion: boolean } | null {
  // تلفن و کد (۸ رقم یا بیشتر پشت هم) عدد سفارش نیست
  const clean = qtyText(text);
  // بعد از واحد حرف نیاید («۳ ستاره» ست نیست، «۲ تاکسی» تا نیست)
  const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${SCALE})?\\s*(${UNIT}|تا)?(?![\\p{L}])(?=([^\\d]{0,12})(\\d)?)`, "gu");
  let best: number | null = null;
  for (const m of clean.matchAll(re)) {
    const [whole, numRaw, scale, unit, after, nextDigit] = m;
    if (!unit && !scale) continue;
    if (NOT_QTY.test(after ?? "")) continue;
    // «۱۰ تا ۲۰ روز» بازه است، نه تعداد (عدد دوم با واحد خودش جدا خوانده می‌شود)
    if (unit === "تا" && nextDigit && /^\s*$/.test(after ?? "")) continue;
    const rest = clean.slice((m.index ?? 0) + whole.length);
    if ((unit === "تا" || (!unit && scale)) && !buyVerbNear(rest)) continue;
    let v = Number(numRaw);
    if (scale === "هزار" || scale === "k") v *= 1000;
    if (scale === "میلیون") v *= 1_000_000;
    if (Number.isFinite(v) && v >= 1 && v <= 100_000_000) best = Math.max(best ?? 0, Math.round(v));
  }
  return best === null ? null : { qty: best, priceQuestion: PRICE_Q.test(clean) };
}

// ---------- خط signals در جواب مدل ----------
// قالب (prompt.ts): «signals: none» یا «signals: qty=500; budget=200 million toman; import=yes; channel=online»
export const SIGNALS_LINE = /^\s*[*_`]*\s*signals?\s*[*_`]*\s*[:：]/i;

export type RawSignals = {
  qty?: number;
  budget?: { amount: number; scale: "" | "thousand" | "million" | "billion"; currency: "toman" | "rial" | "usd" | "cny" };
  import?: boolean;
  channel?: string;
};

const SCALES: Record<string, RawSignals["budget"] extends infer B ? (B extends { scale: infer S } ? S : never) : never> = {
  thousand: "thousand",
  k: "thousand",
  million: "million",
  m: "million",
  billion: "billion",
  b: "billion",
};
const CURRENCIES: Record<string, "toman" | "rial" | "usd" | "cny"> = {
  toman: "toman",
  irt: "toman",
  rial: "rial",
  irr: "rial",
  usd: "usd",
  dollar: "usd",
  dollars: "usd",
  cny: "cny",
  yuan: "cny",
  rmb: "cny",
};

export function parseSignalsLine(content: string): RawSignals {
  const out: RawSignals = {};
  const line = content
    .replace(/\r/g, "")
    .split("\n")
    .find((l) => SIGNALS_LINE.test(l));
  if (!line) return out;
  const body = line.replace(SIGNALS_LINE, "").replace(/[*`]/g, "").trim();
  if (!body || /^none\b/i.test(body)) return out;
  for (const part of body.split(/[;|]/)) {
    const m = /^\s*([a-z_]+)\s*=\s*(.+?)\s*$/i.exec(part);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = normFa(m[2]);
    if (k === "qty") {
      const n = Number(v.replace(/[,\s]/g, ""));
      if (Number.isInteger(n) && n >= 1 && n <= 100_000_000) out.qty = n;
    } else if (k === "budget") {
      const b = /^([\d.,]+)\s*(thousand|million|billion|k|m|b)?\s*([a-z]+)?$/.exec(v.replace(/\s+/g, " "));
      if (!b) continue;
      const amount = Number(b[1].replace(/,/g, ""));
      const currency = CURRENCIES[b[3] ?? "toman"];
      if (Number.isFinite(amount) && amount > 0 && currency) out.budget = { amount, scale: b[2] ? SCALES[b[2]] : "", currency };
    } else if (k === "import") {
      if (/^(yes|true|1)$/.test(v)) out.import = true;
      else if (/^(no|false|0)$/.test(v)) out.import = false;
    } else if (k === "channel") {
      const c = v.replace(/[^a-z]/g, "");
      if (c in CHANNEL_FA) out.channel = c;
    }
  }
  return out;
}

// ---------- محافظ: هیچ اثری از بخش نشانه‌ها در متن مشتری ----------
// هر خط «signals:» (هر جای جواب) حذف می‌شود؛ بعد تکه‌های «qty=…»، «budget=…»، «import=…»، «channel=…» و کلمه‌ی signals.
const LEFTOVER = /\b(qty|budget|import|channel)\s*=\s*[^\s;|،,()[\]]+(\s*(thousand|million|billion|toman|rial|usd|cny))*|\bsignals?\b/gi;
export function stripSignals(answer: string): { text: string; leaked: boolean } {
  const lines = answer.replace(/\r/g, "").split("\n");
  const kept = lines.filter((l) => !SIGNALS_LINE.test(l));
  let text = kept.join("\n");
  let leaked = kept.length !== lines.length;
  if (LEFTOVER.test(text)) {
    leaked = true;
    text = text
      .replace(LEFTOVER, "")
      .replace(/[(\[]\s*[;|،,]*\s*[)\]]/g, "")
      .replace(/[ \t]+([;|،,.])/g, "$1");
  }
  LEFTOVER.lastIndex = 0;
  return { text: text.replace(/[ \t]{2,}/g, " ").trim(), leaked };
}

// ---------- مشتری خودش قالب نشانه نوشته؟ ----------
// «signals: …» یا «qty=…» در متن مشتری ← نشانه‌های مدل برای همین پیام نادیده گرفته می‌شوند (تزریق)
const INJECTION = /(signals?\s*[:：=])|\b(qty|budget|import|channel)\s*=/i;
export const looksLikeInjection = (customerText: string) => INJECTION.test(normFa(customerText));

// عددهای متن مشتری (رقم فارسی/لاتین، جداکننده‌ی هزارگان حذف)
const numbersIn = (s: string) =>
  new Set(
    (
      normFa(s)
        .replace(/(\d)[,٬](?=\d{3}\b)/g, "$1")
        .match(/\d+(?:\.\d+)?/g) ?? []
    ).map((x) => String(Number(x))),
  );

// ---------- بودجه: تبدیل به میلیون تومان ----------
const MULT = { "": 1, thousand: 1e3, million: 1e6, billion: 1e9 } as const;
// «هزار/میلیون/میلیارد» صریح در متن مشتری (مدل نباید مقیاس را حدس بزند؛ کد هم با متن مشتری چک می‌کند)
const SCALE_WORD: Record<string, RegExp> = {
  thousand: /(هزار|thousand|\dk(?![a-z])|(?:^|[^a-z])k(?![a-z]))/,
  million: /(میلیون|ملیون|million|\dm(?![a-z])|(?:^|[^a-z])m(?![a-z]))/,
  billion: /(میلیارد|ملیارد|billion|\db(?![a-z])|(?:^|[^a-z])b(?![a-z]))/,
};
export const SCALE_FA: Record<string, string> = { "": "", thousand: "هزار", million: "میلیون", billion: "میلیارد" };
const CURRENCY_FA = { toman: "تومان", rial: "ریال", usd: "دلار", cny: "یوان" } as const;

// rateToman: نرخ بازار یک واحد ارز به تومان (برای دلار/یوان)؛ null = نامعلوم ← بودجه‌ی دلاری ثبت نمی‌شود
export function budgetSignal(b: NonNullable<RawSignals["budget"]>, customerText: string, rateToman: { usd: number | null; cny: number | null }): Signal | null {
  const label = `${b.amount.toLocaleString("fa-IR")}${b.scale ? ` ${SCALE_FA[b.scale]}` : ""} ${CURRENCY_FA[b.currency]}`;
  const explicitScale = b.scale !== "" && SCALE_WORD[b.scale].test(normFa(customerText));
  // مقیاس که مشتری نگفته ولی مدل گذاشته ← مدل حدس زده: مبهم
  const scale = b.scale !== "" && !explicitScale ? "" : b.scale;
  let toman = b.amount * MULT[scale];
  if (b.currency === "rial") toman /= 10;
  if (b.currency === "usd" || b.currency === "cny") {
    const r = b.currency === "usd" ? rateToman.usd : rateToman.cny;
    if (!r) return null;
    toman *= r;
  }
  // تومان/ریال بدون هزار/میلیون/میلیارد و عدد کوچک (کمتر از ۱۰ میلیون): در محاوره ممکن است هزار یا میلیون باشد ← مبهم
  const ambiguous = (b.currency === "toman" || b.currency === "rial") && scale === "" && b.amount < 10_000_000;
  if (ambiguous) return { key: "budget_unclear", valueNum: null, valueText: label, confidence: 0.3, via: "ai" };
  return { key: "budget_mtoman", valueNum: Math.round((toman / 1e6) * 100) / 100, valueText: label, confidence: 0.8, via: "ai" };
}

// نشانه‌های یک پیام مشتری: تعداد با کد + خط signals مدل (اگر جواب مدل در کار بود). مدل فقط وقتی معتبر است که:
//   مشتری خودش قالب نشانه ننوشته باشد، و عدد تعداد/بودجه واقعاً در متن مشتری باشد.
export function signalsFromMessage(
  customerText: string,
  modelContent: string | null,
  rateToman: { usd: number | null; cny: number | null } = { usd: null, cny: null },
): { signals: Signal[]; ignoredModel: boolean } {
  const out: Signal[] = [];
  const q = extractOrderQty(customerText);
  if (q)
    out.push({ key: "order_qty", valueNum: q.qty, valueText: q.qty.toLocaleString("fa-IR"), confidence: q.priceQuestion ? 0.6 : 0.9, via: "code", priceQuestion: q.priceQuestion });
  if (!modelContent) return { signals: out, ignoredModel: false };
  if (looksLikeInjection(customerText)) return { signals: out, ignoredModel: true };
  const raw = parseSignalsLine(modelContent);
  const nums = numbersIn(customerText);
  if (!q && raw.qty && nums.has(String(raw.qty)) && qtyAttached(customerText, raw.qty))
    out.push({ key: "order_qty", valueNum: raw.qty, valueText: raw.qty.toLocaleString("fa-IR"), confidence: 0.7, via: "ai" });
  if (raw.budget && nums.has(String(raw.budget.amount))) {
    const b = budgetSignal(raw.budget, customerText, rateToman);
    if (b) out.push(b);
  }
  if (raw.import !== undefined) out.push({ key: "import_experience", valueNum: raw.import ? 1 : 0, valueText: raw.import ? "دارد" : "ندارد", confidence: 0.8, via: "ai" });
  if (raw.channel) out.push({ key: "sales_channel", valueNum: 1, valueText: CHANNEL_FA[raw.channel], confidence: 0.8, via: "ai", channel: raw.channel });
  return { signals: out, ignoredModel: false };
}

// سؤال کوتاه روشن کردن بودجه‌ی مبهم (کد به آخر همان جواب اضافه می‌کند؛ فقط یک بار در هر گفتگو)
export function clarifyBudget(label: string): string {
  return `راستی، منظورتان از «${label}» چه مبلغی است؟ مثلاً ${label.replace(/ (تومان|ریال)$/, " میلیون $1")}؟`;
}

// خلاصه‌ی نشانه برای آزمون دستیار: «order_qty=500»، «sales_channel=online»، «budget_unclear»
export const signalTag = (s: Signal) => (s.key === "sales_channel" && s.channel ? `${s.key}=${s.channel}` : s.valueNum === null ? s.key : `${s.key}=${s.valueNum}`);

// متن کوتاه آخرین نشانه برای ستون فهرست مشتریان (بخش ۵۰): «۵۰۰ عدد»، «بودجه ۲۰۰ میلیون تومان»، «بودجه: مبهم»، …
export function signalShort(key: string, valueNum: number | string | null, valueText: string | null): string {
  const n = valueNum === null || valueNum === "" ? null : Number(valueNum);
  switch (key) {
    case "order_qty":
      return n !== null ? `${n.toLocaleString("fa-IR")} عدد` : "تعداد سفارش";
    case "budget_mtoman":
      return n !== null ? `بودجه ${n.toLocaleString("fa-IR")} میلیون تومان` : "بودجه";
    case "budget_unclear":
      return "بودجه: مبهم";
    case "import_experience":
      return `سابقه‌ی واردات: ${n === 1 ? "دارد" : "ندارد"}`;
    case "sales_channel":
      return `کانال: ${valueText ?? "—"}`;
    default:
      return valueText ?? (n !== null ? n.toLocaleString("fa-IR") : key);
  }
}
