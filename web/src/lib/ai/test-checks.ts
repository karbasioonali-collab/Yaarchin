// آزمون دستیار: بررسی‌های خودکار و تخمین هزینه (بدون server-only تا تست واحد مستقیم اجرایش کند). docs/infoyaarchin.md بخش ۳۳.
import { compact } from "./normalize";
import { isPriceOnlyQuestion, isTimeOnlyQuestion, priceQtyQuestion } from "./price-reply";
import { pleasantry, preRule } from "./rules";

export type TestExpect = { handoff: string | null; source: string | null; forbidden: string[]; mustInclude: string[]; signals?: string[] };
export const EMPTY_EXPECT: TestExpect = { handoff: null, source: null, forbidden: [], mustInclude: [] };

// نتیجه‌ی یک سؤال آزمون از همان مسیر چت
//   path: canned (جواب آماده) | rule (قاعده‌ی کد، بدون مدل) | model | error
//   source: منبع جواب (product | calculator | knowledge | general | canned) یا null وقتی ارجاع شد
//   handoff: دلیل ارجاع یا null      answer: متنی که مشتری می‌دید (یا جواب ردشده‌ی محافظ)      guardHits: یافته‌های محافظ
//   signals: نشانه‌هایی که از این پیام ثبت می‌شد (signalTag؛ بخش ۴۳)
//   path price = «جواب قیمت با کد» (بخش ۴۶)؛ suspectNumbers = مبلغ/زمانِ نبوده در داده‌ها (بررسی «عدد خارج از داده»)
export type TestOutcome = {
  path: "canned" | "rule" | "price" | "model" | "error";
  source: string | null;
  handoff: string | null;
  answer: string;
  guardHits: string[];
  signals?: string[];
  suspectNumbers?: string[];
};
export type Check = { check: "error" | "guard" | "handoff" | "source" | "forbidden" | "mustInclude" | "signals" | "numbers"; ok: boolean; detail: string };

const has = (text: string, word: string) => {
  const w = compact(word);
  return w.length > 0 && compact(text).includes(w);
};

// منبع مورد انتظار می‌تواند چند گزینه با | باشد (مثلاً «product|calculator»)
export const sourceOptions = (s: string | null) =>
  (s ?? "")
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);

export function runChecks(e: TestExpect, o: TestOutcome): Check[] {
  const out: Check[] = [];
  if (o.path === "error") out.push({ check: "error", ok: false, detail: o.answer || "خطا" });
  // جوابی که محافظ رد کرد همیشه «رد» است
  out.push({ check: "guard", ok: o.guardHits.length === 0, detail: o.guardHits.join("، ") });
  if (e.handoff) {
    const want = e.handoff;
    const ok = want === "none" ? !o.handoff : want === "any" ? !!o.handoff : o.handoff === want;
    out.push({ check: "handoff", ok, detail: `انتظار: ${want} · نتیجه: ${o.handoff ?? "none"}` });
  }
  // منبع فقط وقتی سنجیده می‌شود که جواب داده شد (ارجاع را بررسی handoff می‌سنجد)
  const opts = sourceOptions(e.source);
  if (opts.length && !o.handoff) out.push({ check: "source", ok: !!o.source && opts.includes(o.source), detail: `انتظار: ${opts.join(" یا ")} · نتیجه: ${o.source ?? "—"}` });
  const bad = e.forbidden.filter((w) => has(o.answer, w));
  if (e.forbidden.length) out.push({ check: "forbidden", ok: bad.length === 0, detail: bad.join("، ") });
  if (e.mustInclude.length && !o.handoff) {
    const miss = e.mustInclude.filter((w) => !has(o.answer, w));
    out.push({ check: "mustInclude", ok: miss.length === 0, detail: miss.length ? `نیست: ${miss.join("، ")}` : "" });
  }
  // عدد خارج از داده (بخش ۴۶): فقط برای جواب مدل؛ همیشه سنجیده می‌شود، مستقل از سوئیچ چت
  if (o.path === "model" && !o.handoff) {
    const sus = o.suspectNumbers ?? [];
    out.push({ check: "numbers", ok: sus.length === 0, detail: sus.join("، ") });
  }
  // نشانه‌ها: هر مورد «کلید=مقدار» دقیق، یا فقط «کلید»؛ «none» = هیچ نشانه‌ای
  const want = e.signals ?? [];
  if (want.length) {
    const got = o.signals ?? [];
    const okSig = want.includes("none") ? got.length === 0 : want.every((w) => (w.includes("=") ? got.includes(w) : got.some((g) => g === w || g.startsWith(`${w}=`))));
    out.push({ check: "signals", ok: okSig, detail: `انتظار: ${want.join("، ")} · نتیجه: ${got.join("، ") || "none"}` });
  }
  return out;
}

export const allPass = (checks: Check[]) => checks.every((c) => c.ok);

// سؤالی که بدون مدل جواب می‌گیرد (جواب آماده، قاعده‌ی کد، یا جواب قیمت با کد) هزینه ندارد.
// productTitle = عنوان محصول منتشرشده‌ی قیمت‌دار سؤال (برای «جواب قیمت با کد»)
export function ruleCaught(question: string, bigOrderQty: number, productTitle?: string | null): "canned" | "rule" | "price" | null {
  if (pleasantry(question)) return "canned";
  if (preRule(question, { bigOrderQty })) return "rule";
  return productTitle && (isPriceOnlyQuestion(question, productTitle) || priceQtyQuestion(question, productTitle) !== null || isTimeOnlyQuestion(question, productTitle))
    ? "price"
    : null;
}

// پیش‌فرض میانگین هزینه‌ی هر جواب مدل وقتی هنوز درخواست زنده‌ای نیست (عدد واقعی بعد از PR #28 حدود ۶۰۰ تا ۱٬۲۰۰ تومان؛ بخش ۳۲)
export const DEFAULT_AVG_TOMAN = 900;

// تخمین هزینه‌ی اجرا: تعداد سؤال‌هایی که به مدل می‌روند × میانگین هزینه‌ی ۳۰ درخواست زنده‌ی اخیر. حالت آزمایشی = صفر.
export function estimateRun(questions: (string | { question: string; productTitle?: string | null })[], o: { bigOrderQty: number; avgToman: number; live: boolean }) {
  const free = questions.filter((q) => (typeof q === "string" ? ruleCaught(q, o.bigOrderQty) : ruleCaught(q.question, o.bigOrderQty, q.productTitle))).length;
  const model = questions.length - free;
  return { total: questions.length, free, model, toman: o.live ? Math.round(model * o.avgToman) : 0 };
}
