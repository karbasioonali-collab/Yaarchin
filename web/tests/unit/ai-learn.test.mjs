// تست واحد آزمون دستیار و چرخه‌ی یادگیری: بررسی‌های خودکار، تخمین هزینه، کلید پیشنهاد، «قاعده‌ی کد نگرفت»، مبلغ در پایگاه دانش،
// و سازگاری سؤال‌های آزمون seed (test-drafts.json) با قاعده‌های کد. docs/infoyaarchin.md بخش ۳۳.
import { readFileSync } from "node:fs";
import { CURRENCY_ERROR, hasCurrencyAmount, isRuleGap, kindForModelHandoff, suggestionKey } from "../../src/lib/ai/learn.ts";
import { allPass, EMPTY_EXPECT, estimateRun, ruleCaught, runChecks, sourceOptions } from "../../src/lib/ai/test-checks.ts";
import { HANDOFF_FA, preRule } from "../../src/lib/ai/rules.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};
const E = (o) => ({ ...EMPTY_EXPECT, ...o });
const O = (o) => ({ path: "model", source: "product", handoff: null, answer: "جواب", guardHits: [], ...o });
const pass = (e, o) => allPass(runChecks(E(e), O(o)));

// ---- بررسی‌های خودکار
ok(pass({}, {}), "no expectations → pass");
ok(pass({ handoff: "none" }, {}), "handoff none, no handoff → pass");
ok(!pass({ handoff: "none" }, { handoff: "no_source", source: null }), "handoff none, handed off → fail");
ok(pass({ handoff: "any" }, { handoff: "model", source: null }), "handoff any → pass on any reason");
ok(!pass({ handoff: "any" }, {}), "handoff any, answered → fail");
ok(pass({ handoff: "restricted" }, { path: "rule", handoff: "restricted", source: null }), "specific reason matches");
ok(!pass({ handoff: "restricted" }, { handoff: "no_source", source: null }), "specific reason mismatch → fail");
ok(pass({ source: "product|calculator" }, { source: "calculator" }), "source alternatives");
ok(!pass({ source: "knowledge" }, { source: "general" }), "wrong source → fail");
ok(pass({ source: "knowledge" }, { handoff: "no_source", source: null }), "source not checked when handed off");
ok(!runChecks(E({ source: "knowledge" }), O({ handoff: "no_source", source: null })).some((c) => c.check === "source"), "no source check row on handoff");
ok(!pass({ forbidden: ["علی‌بابا"] }, { answer: "از علی بابا نخرید" }), "forbidden matches across ZWNJ/space");
ok(!pass({ forbidden: ["alibaba"] }, { answer: "ALIBABA ارزان است" }), "forbidden case-insensitive");
ok(pass({ forbidden: ["1688"] }, { answer: "کارشناس پاسخ می‌دهد" }), "forbidden absent → pass");
ok(pass({ mustInclude: ["تخمینی"] }, { answer: "این قیمت تخمینی است." }), "mustInclude present");
ok(!pass({ mustInclude: ["تخمینی"] }, { answer: "قیمت ۱۰۰ تومان" }), "mustInclude missing → fail");
ok(pass({ mustInclude: ["تخمینی"] }, { handoff: "no_source", source: null, answer: "کارشناس" }), "mustInclude skipped on handoff");
ok(!pass({}, { guardHits: ["url: x.com"], handoff: "leak", source: null }), "guard block always fails");
ok(!pass({}, { path: "error", handoff: "error", source: null, answer: "timeout" }), "error path fails");
ok(runChecks(E({ handoff: "none" }), O({ guardHits: ["phone: 0912"] })).find((c) => c.check === "guard")?.detail === "phone: 0912", "guard detail");
ok(sourceOptions(" product | calculator ").join(",") === "product,calculator" && sourceOptions(null).length === 0, "sourceOptions");

// ---- مسیر رایگان و تخمین
ok(ruleCaught("سلام", 5000) === "canned", "greeting is canned");
ok(ruleCaught("پیش‌فاکتور بده", 5000) === "rule", "proforma is rule");
ok(ruleCaught("می‌خوام ۲۰٬۰۰۰ تا سفارش بدم", 5000) === "rule", "big order is rule");
ok(ruleCaught("می‌خوام ۲۰٬۰۰۰ تا سفارش بدم", 50000) === null, "big order threshold respected");
ok(ruleCaught("FOB یعنی چی؟", 5000) === null, "general question needs model");
let est = estimateRun(["سلام", "پیش‌فاکتور بده", "FOB یعنی چی؟", "نمونه می‌فرستید؟"], { bigOrderQty: 5000, avgToman: 900, live: true });
ok(est.total === 4 && est.free === 2 && est.model === 2 && est.toman === 1800, `estimate live ${JSON.stringify(est)}`);
est = estimateRun(["FOB یعنی چی؟"], { bigOrderQty: 5000, avgToman: 900, live: false });
ok(est.toman === 0 && est.model === 1, "estimate test mode is free");
ok(estimateRun(["a", "b", "c"], { bigOrderQty: 5000, avgToman: 333.4, live: true }).toman === 1000, "estimate rounds");

// ---- کلید پیشنهاد (یکی کردن تکراری‌ها)
ok(suggestionKey("قیمتش چنده؟") === suggestionKey("  قيمتش   چنده ؟؟ "), "key: arabic ye, spaces, punctuation");
ok(suggestionKey("لپ‌تاپ گیمینگ دارید؟!") === suggestionKey("لپ تاپ گیمینگ دارید"), "key: ZWNJ and ?!");
ok(suggestionKey("۵۰۰ تا") === suggestionKey("500 تا"), "key: digits");
ok(suggestionKey("سلام 😀") === "سلام", "key: emoji removed");
ok(suggestionKey("x".repeat(500)).length === 300, "key capped");
ok(suggestionKey("قیمت") !== suggestionKey("قیمت قطعی"), "different questions differ");

// ---- «قاعده‌ی کد نگرفت» و نوع پیشنهاد
for (const r of ["restricted", "proforma", "discount", "final_price", "complaint", "big_order"]) ok(isRuleGap(r) && kindForModelHandoff(r) === "rule_gap", `rule gap: ${r}`);
for (const r of ["no_source", "model", "human", "other", null, undefined]) ok(!isRuleGap(r), `not rule gap: ${r}`);
ok(kindForModelHandoff("no_source") === "no_answer" && kindForModelHandoff("parse") === "no_answer", "no_answer kinds");
ok(kindForModelHandoff("leak") === "leak", "leak kind");
ok(kindForModelHandoff("model") === "handoff" && kindForModelHandoff("other") === "handoff" && kindForModelHandoff("human") === "handoff", "plain model handoff");
for (const r of ["error", "busy", "stuck", "global_cap", "customer_cap", "long_chat", "lead_score"]) ok(kindForModelHandoff(r) === null, `no suggestion for ${r}`);

// ---- مبلغ در جواب پایگاه دانش
for (const t of ["حدود ۵۰۰٬۰۰۰ تومان", "500000 تومان", "۲ میلیون تومان", "قیمت 3.5 دلار", "10 یوان", "20 USD", "$12", "12$", "۱۲۰۰ ریال", "50 هزار تومن", "۵ دلار است"])
  ok(hasCurrencyAmount(t), `currency: ${t}`);
for (const t of ["قیمت از ماشین‌حساب سایت می‌آید", "حداقل سفارش ۵۰۰ عدد", "زمان رسیدن ۲۰ تا ۳۰ روز", "هزینه به تومان حساب می‌شود", "۳۰ درصد پیش‌پرداخت", "قیمت دلار روز"])
  ok(!hasCurrencyAmount(t), `not currency: ${t}`);
ok(CURRENCY_ERROR.includes("قیمت از داده‌های سایت می‌آید"), "currency error text");

// ---- سؤال‌های آزمون seed
const drafts = JSON.parse(readFileSync(new URL("../../src/db/test-drafts.json", import.meta.url), "utf8"));
ok(drafts.length === 38, `38 drafts (${drafts.length})`);
ok(new Set(drafts.map((d) => suggestionKey(d.question))).size === drafts.length, "drafts unique");
const HANDOFFS = new Set(["none", "any", ...Object.keys(HANDOFF_FA)]);
const SRC = new Set(["product", "calculator", "knowledge", "general", "canned"]);
for (const d of drafts) {
  ok(["normal", "tricky", "handoff"].includes(d.category), `category #${d.n}`);
  ok(d.expect && Array.isArray(d.expect.forbidden) && Array.isArray(d.expect.mustInclude), `expect shape #${d.n}`);
  ok(d.expect.handoff === null || HANDOFFS.has(d.expect.handoff), `handoff value #${d.n}`);
  ok(
    sourceOptions(d.expect.source).every((s) => SRC.has(s)),
    `source value #${d.n}`,
  );
  // اگر قاعده‌ی کد سؤال را می‌گیرد، انتظار ارجاع باید با همان دلیل (یا any) سازگار باشد
  const pre = preRule(d.question, { bigOrderQty: 5000 });
  if (pre && d.expect.handoff) ok(d.expect.handoff === pre || d.expect.handoff === "any", `#${d.n} rule ${pre} vs expect ${d.expect.handoff}`);
  if (d.expect.handoff === "none") ok(!pre, `#${d.n} expects no handoff but rule ${pre}`);
}
// قاعده‌ی کد باید این‌ها را بدون مدل بگیرد (کارخانه، سایت خرید، پیش‌فاکتور، …)
for (const k of [16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 31, 32, 33, 34, 35, 36, 37])
  ok(!!preRule(drafts.find((d) => d.n === k).question, { bigOrderQty: 5000 }), `rule catches draft #${k}`);

console.log(`${n} checks${fails ? `, ${fails} FAILED` : ", ALL PASSED"}`);
process.exitCode = fails ? 1 : 0;
