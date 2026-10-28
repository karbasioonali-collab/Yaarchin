// چرخه‌ی یادگیری دستیار: قاعده‌های خالص «پیشنهاد سؤال تازه» و پایگاه دانش (بدون server-only تا تست واحد مستقیم اجرایش کند).
// docs/infoyaarchin.md بخش ۳۳.
import { normFa } from "./normalize";

export const SUGGESTION_KINDS = ["no_answer", "handoff", "rule_gap", "thumbs_down", "wrong", "repeated", "leak", "test_wrong", "ai_tricky"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export const SUGGESTION_FA: Record<SuggestionKind, string> = {
  no_answer: "بی‌جواب",
  handoff: "ارجاع مدل",
  rule_gap: "قاعده‌ی کد نگرفت",
  thumbs_down: "👎 مشتری",
  wrong: "جواب اشتباه (کارشناس)",
  repeated: "تکرار سؤال",
  leak: "محافظ جلوگیری کرد",
  test_wrong: "آزمون: اشتباه",
  ai_tricky: "پیشنهاد AI (فریبنده)",
};

// کلید یکسان‌شده‌ی سؤال برای یکی کردن تکراری‌ها: حروف و ارقام یکسان، بدون علامت و ایموجی، فاصله‌ها یکی
export function suggestionKey(text: string): string {
  return normFa(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

// دلیل‌هایی که قاعده‌ی کد (rules.ts → preRule) هم پوشش می‌دهد. اگر «مدل» با یکی از این‌ها ارجاع داد، یعنی قاعده‌ی کد
// این شکل پرسیدن را نگرفت (هزینه‌ی مدل داده شد) ← برچسب جدای «قاعده‌ی کد نگرفت» تا قاعده بهتر شود.
export const RULE_COVERED = ["restricted", "proforma", "discount", "final_price", "complaint", "big_order"] as const;
export const isRuleGap = (reason: string | null | undefined): boolean => !!reason && (RULE_COVERED as readonly string[]).includes(reason);

// نوع پیشنهاد برای ارجاعی که «مدل» داد (ارجاع با قاعده‌ی کد، سقف‌ها و خطاها پیشنهاد نمی‌سازند)
export function kindForModelHandoff(reason: string): SuggestionKind | null {
  if (reason === "no_source" || reason === "parse") return "no_answer";
  if (reason === "leak") return "leak";
  if (isRuleGap(reason)) return "rule_gap";
  if (["error", "busy", "stuck", "global_cap", "customer_cap", "long_chat", "lead_score"].includes(reason)) return null;
  return "handoff";
}

// جواب پایگاه دانش نباید مبلغ داشته باشد (قیمت همیشه از داده‌های سایت و ماشین‌حساب می‌آید)
// عدد (فارسی یا لاتین، با جداکننده) و بعدش تومان/ریال/دلار/یوان/USD، یا $ کنار عدد
const CURRENCY_RE = /\d[\d,٬.]*\s*(هزار|میلیون|میلیارد|k)?\s*(تومان|تومن|ریال|دلار|یوان|usd|rmb|cny)|\$\s*\d|\d\s*\$/i;
export const hasCurrencyAmount = (text: string): boolean => CURRENCY_RE.test(normFa(text));
export const CURRENCY_ERROR = "قیمت از داده‌های سایت می‌آید؛ در جواب پایگاه دانش مبلغ (عدد با تومان، ریال، دلار، یوان یا $) ننویسید.";
