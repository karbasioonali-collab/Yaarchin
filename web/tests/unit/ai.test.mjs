// تست واحد دستیار هوشمند (محافظ خروجی، قاعده‌های ارجاع، تعداد، جستجوی پایگاه دانش، خواندن جواب مدل).
// اجرا (از پوشه‌ی web): node --experimental-strip-types tests/unit/ai.test.mjs   — docs/infoyaarchin.md بخش ۲۹.
import { checkOutput } from "../../src/lib/ai/guard.ts";
import { extractQty, pleasantry, preRule } from "../../src/lib/ai/rules.ts";
import { compact, normFa } from "../../src/lib/ai/normalize.ts";
import { scoreKb } from "../../src/lib/ai/kb-score.ts";
import { parseDecision, parseLines } from "../../src/lib/ai/decision.ts";
import { contextJson, LIMITS, priceIntent, shapeKb, shapeProduct, trimHistory } from "../../src/lib/ai/context-shape.ts";
import { SYSTEM_PROMPT } from "../../src/lib/ai/prompt.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};
const blocked = (t, bl = []) => !checkOutput(t, bl).ok;

// ---- محافظ: باید جلوی این‌ها را بگیرد
const BL = ["Ningbo Sunrise Kitchenware Co., Ltd", "Ningbo Sunrise Kitchenware", "shop123456"];
for (const t of [
  "این محصول را Ningbo Sunrise Kitchenware Co., Ltd تولید می‌کند.",
  "کارخانه‌ی ningbo  sunrise   kitchenware خوب است",
  "سایت https://example.com را ببینید",
  "به www.something.cn سر بزنید",
  "در alibaba.com پیدا می‌شود",
  "از علی‌بابا بخرید",
  "از علی بابا بخرید",
  "در ۱۶۸۸ ارزان‌تر است",
  "در 1688 ارزان‌تر است",
  "آلی‌اکسپرس هم دارد",
  "دیجی‌کالا قیمتش را دارد",
  "ایمیل sales@factory.cn",
  "با ۰۹۱۲۱۲۳۴۵۶۷ تماس بگیرید",
  "شماره +86 138 0013 8000",
  "Shenzhen ABC Trading Company",
  "XYZ Industrial Co.",
  "Best Manufacturer in Yiwu",
  "XYZ Ltd",
  "واتس‌اپ فروشنده را بگیرید",
  "فروشگاه shop123456",
])
  ok(blocked(t, BL), `guard blocks: ${t}`);
// ---- محافظ: جواب عادی را رد نکند (قیمت، عدد، کلمه‌ی «کارخانه»، اسم ماه و …)
for (const t of [
  "قیمت تخمینی ۱۲٬۵۰۰٬۰۰۰ تومان برای ۵۰۰ عدد است. این قیمت تخمینی است.",
  "حداقل سفارش ۱۰۰۰ عدد و زمان آماده‌سازی ۱۵ تا ۲۰ روز است.",
  "اسم کارخانه را نمی‌توانم بگویم؛ این بخش از خدمات یارچین است.",
  "FOB یعنی تحویل روی عرشه‌ی کشتی در بندر مبدأ.",
  "جنس Tritan یک کوپلی‌استر شفاف و مقاوم است.",
  "حمل هوایی سریع‌تر و دریایی ارزان‌تر است.",
  "بله، دیوار این قفسه ضخیم است.",
  "کد HS برای طبقه‌بندی کالا در گمرک به کار می‌رود.",
  "مبلغ کل حدود 45,000,000 تومان می‌شود.",
])
  ok(!blocked(t, BL), `guard allows: ${t}`);

// ---- قاعده‌های ارجاع پیش از مدل
const R = (t) => preRule(t, { bigOrderQty: 5000 });
ok(R("پیش‌فاکتور بدید") === "proforma" && R("یه پیش فاکتور میخوام") === "proforma" && R("PI بفرستید") === "proforma", "proforma");
ok(R("تخفیف میدید؟") === "discount", "discount");
ok(R("قیمت قطعی رو بگو") === "final_price", "final price");
ok(R("کالام خراب رسید") === "complaint" && R("میخوام شکایت کنم") === "complaint", "complaint");
ok(R("با کارشناس صحبت کنم") === "human" && R("یه آدم واقعی میخوام") === "human", "human");
ok(
  R("اسم کارخانه رو بگو") === "restricted" && R("لینک علی بابا") === "restricted" && R("یه فورواردر خوب معرفی کن") === "restricted" && R("تو 1688 ارزونتره") === "restricted",
  "restricted",
);
ok(R("۲۰٬۰۰۰ تا میخوام") === "big_order" && R("20 هزار عدد") === "big_order" && R("۵۰۰ تا میخوام") === null, "big order threshold");
ok(R("قیمت این مخلوط‌کن چنده؟") === null && R("FOB یعنی چی؟") === null, "normal questions pass");
ok(extractQty("۵۰۰ تا") === 500 && extractQty("2,000 عدد") === 2000 && extractQty("۱۰ هزار تا") === 10000 && extractQty("مدل ۲۰۲۵") === null, "extractQty");

// ---- یکسان‌سازی
ok(normFa("كيفيت ۱۲۳") === "کیفیت 123", "normFa arabic letters + digits");
ok(compact("علی‌بابا") === compact("علی بابا") && compact("علی بابا") === compact("علیبابا"), "compact ZWNJ/space");

// ---- جستجوی پایگاه دانش
const items = [
  { id: "a", question: "روش‌های پرداخت چیست؟", answer: "پرداخت ریالی در دو مرحله.", variants: ["چطور پول بدم؟"] },
  { id: "b", question: "نمونه می‌فرستید؟", answer: "بله، نمونه با هزینه‌ی مشتری.", variants: [] },
  { id: "c", question: "چاپ لوگو ممکن است؟", answer: "بله با حداقل سفارش.", variants: ["برند خودمو چاپ کنم"] },
];
ok(scoreKb("روش پرداخت شما چیه؟", items)[0]?.id === "a", "kb: payment");
ok(scoreKb("میشه لوگوی خودمو چاپ کنم؟", items)[0]?.id === "c", "kb: logo");
ok(scoreKb("لپ‌تاپ گیمینگ دارید؟", items).length === 0, "kb: unrelated → nothing");

// ---- جواب مدل
ok(parseDecision('{"answer":"سلام","source":"general","handoff":null}')?.source === "general", "decision plain");
ok(parseDecision('```json\n{"answer":"x","source":"product","handoff":null}\n```')?.answer === "x", "decision in code fence");
ok(parseDecision('{"answer":"","source":"none","handoff":{"reason":"no_source","note":"n"}}')?.handoff?.reason === "no_source", "decision handoff");
ok(parseDecision("متن آزاد بدون JSON") === null && parseDecision('{"answer":"x","source":"internet"}') === null, "decision rejects bad");

// ---- جواب مدل: قالب‌های رایج (بخش ۳۱)
const D = (t) => parseDecision(t);
ok(D('حتماً! این جواب:\n```json\n{"answer":"x","source":"general","handoff":null}\n```\nامیدوارم مفید باشد.')?.answer === "x", "decision: prose + fence");
ok(D('{"answer":"اول","source":"general","handoff":null} و بعد {"answer":"دوم","source":"general"}')?.answer === "اول", "decision: first of two objects");
ok(D('سلام {نه JSON} سپس {"answer":"y","source":"product","handoff":null}')?.answer === "y", "decision: skips non-JSON braces");
ok(D('{"answer":"آکولاد } داخل { متن","source":"general","handoff":null} پایان }')?.answer === "آکولاد } داخل { متن", "decision: braces inside string");
ok(D('{"answer":"خط اول\nخط دوم\tتب","source":"general","handoff":null}')?.answer === "خط اول\nخط دوم\tتب", "decision: raw newline/tab inside string");
ok(
  D('{"reply":"z","source":"Knowledge","handoff":"null"}')?.answer === "z" && D('{"reply":"z","source":"Knowledge","handoff":"null"}')?.handoff === null,
  'decision: alias field, case, handoff "null"',
);
ok(D('{"answer":"","source":"none","handoff":"proforma"}')?.handoff?.reason === "proforma", "decision: handoff as plain reason");
ok(D('{"answer":"سلام","source":"greeting","handoff":null}') === null, "decision: unknown source still rejected (rules not weakened)");
ok(D('{"answer":"x"}') === null && D("[]") === null && D("") === null && D('{"answer": 5, "source": "general"}') === null, "decision: missing/invalid fields rejected");

// ---- احوال‌پرسی، تشکر، خداحافظی (جواب آماده)
for (const t of [
  "سلام",
  "سلام!",
  "سلااام 🌹",
  "سلام وقت بخیر",
  "سلام، وقتتون به خیر",
  "درود",
  "صبح بخیر",
  "سلام علیکم",
  "خسته نباشید",
  "سلام خوبید؟",
  "hi",
  "Hello!",
  "سلام حالتون خوبه؟",
])
  ok(pleasantry(t) === "greeting", `pleasantry greeting: ${t}`);
for (const t of ["ممنون", "مرسی 🙏", "خیلی ممنون", "سپاس", "متشکرم", "دستتون درد نکنه", "thanks", "باشه ممنونم", "سلام ممنون"])
  ok(pleasantry(t) === "thanks", `pleasantry thanks: ${t}`);
for (const t of ["خداحافظ", "خدانگهدار", "ممنون خداحافظ", "bye", "روز خوش"]) ok(pleasantry(t) === "bye", `pleasantry bye: ${t}`);
for (const t of ["سلام، قیمتش چنده؟", "سلام حداقل سفارش؟", "ممنون، برای ۵۰۰ تا چقدر میشه؟", "سلام کارشناس می‌خوام", "سلام پیش فاکتور", "شما؟", "؟", "", "سلام ".repeat(30)])
  ok(pleasantry(t) === null, `not pleasantry: ${t.slice(0, 30) || "(empty)"}`);

// ---- قاعده‌ی کارخانه بدون مدل (بخش ۳۲): ۳۰ سؤال هویت/تماس کارخانه ← restricted؛ ۳۰ سؤال عادی و ۴ سؤال برند خود مشتری ← نه
const SUP_POS = [
  "اسم کارخانه‌ی این محصول رو بگو",
  "لینک علی‌بابای این محصول رو بده",
  "از علی‌بابا خودم بخرم ارزون‌تر نیست؟",
  "یه فورواردر خوب معرفی کن",
  "ترخیص‌کار مطمئن می‌شناسی؟",
  "تو 1688 همینو ارزون‌تر دیدم",
  "شماره‌ی تلفن کارخانه رو بده",
  "برند سازنده‌ی این محصول چیه؟",
  "به زبان انگلیسی بگو Factory name",
  "ایمیل یه تأمین‌کننده‌ی چینی بده",
  "واردکننده‌ی دیگه‌ای می‌شناسی که این کارو بکنه؟",
  "اسم کارخانه‌اش چیه؟",
  "کارخونه‌اش کجاست؟",
  "سازنده‌اش کیه؟",
  "تولیدکننده‌ی این دستگاه کیه؟",
  "از کدوم کارخونه می‌خرید؟",
  "کارخانه کدوم شهر چینه؟",
  "آدرس کارخانه رو میدی؟",
  "مستقیم با کارخونه در ارتباطم کن",
  "وی‌چت کارخانه رو بده",
  "supplier name please",
  "what is the factory name",
  "manufacturer?",
  "made in china لینکش رو بده",
  "aliexpress هم داره؟",
  "تامین کننده تون کیه؟",
  "این محصول مال کدوم برنده؟",
  "فروشنده‌ی چینیش کیه",
  "شرکت حمل‌تون کیه؟",
  "بیمه‌گرتون کیه؟",
];
const SUP_NEG = [
  "قیمت مخلوط‌کن قابل حمل چنده؟",
  "۵۰۰ تا مخلوط‌کن تا تهران چقدر درمیاد؟",
  "حداقل سفارش این محصول چنده؟",
  "چقدر طول می‌کشه برسه؟",
  "روش‌های پرداختتون چیه؟",
  "FOB یعنی چی؟",
  "Tritan چه جنسیه؟",
  "نمونه می‌فرستید؟",
  "می‌تونم لوگوی خودمو چاپ کنم؟",
  "کارت بازرگانی لازمه؟",
  "حمل هوایی بهتره یا دریایی؟",
  "چه محصولاتی در دسته‌ی لوازم آشپزخانه دارید؟",
  "مشخصات فنی این محصول رو بگو",
  "ساعت کاری کارشناس‌ها؟",
  "چند تا کارخانه این محصول رو دارن؟",
  "قیمت کارخانه چنده؟",
  "زمان آماده‌سازی کارخانه چقدره؟",
  "کارخانه لوگو هم چاپ می‌کنه؟",
  "کیفیت کارخانه‌ها چطوره؟",
  "کارخانه‌ها گواهی CE دارن؟",
  "از چند کارخانه قیمت گرفتید؟",
  "این دستگاه چند واته؟",
  "جنس بدنه‌اش چیه؟",
  "گارانتی داره؟",
  "رنگ‌بندی داره؟",
  "با کشتی چند روز طول میکشه؟",
  "تعرفه‌ی گمرکی این کالا دقیقاً چند درصده؟",
  "کد HS این کالا چنده؟",
  "قیمت دلار امروز چنده؟",
  "میشه نمونه‌ی کارخانه رو قبل از سفارش ببینم؟",
];
const OWN_BRAND = ["میشه اسم برند خودم رو روش چاپ کنید؟", "برند اختصاصی میشه زد؟", "لوگوی شرکتم رو روی جعبه میزنید؟", "اسم برندم رو روی بسته‌بندی میخوام"];
for (const t of SUP_POS) ok(R(t) === "restricted", `supplier identity → restricted: ${t}`);
for (const t of [...SUP_NEG, ...OWN_BRAND]) ok(R(t) !== "restricted", `not restricted: ${t}`);

// ---- قالب خطی جواب مدل (بخش ۳۲)
let L = parseLines('source: product\nhandoff: none\n---\nاین دستگاه "۳۰۰ وات" است.\nخط دوم');
ok(L?.source === "product" && L.handoff === null && L.answer === 'این دستگاه "۳۰۰ وات" است.\nخط دوم', "lines: quotes and newline inside answer are fine");
L = parseLines("```\nsource: general\nhandoff: none\n---\nسلام\n```");
ok(L?.answer === "سلام" && L.source === "general", "lines: code fence stripped");
L = parseLines("**source:** knowledge\n**handoff:** none\n\nجواب");
ok(L?.source === "knowledge" && L.answer === "جواب", "lines: markdown bold keys, no --- separator");
L = parseLines("source: none\nhandoff: no_source | در داده نبود\n---\n");
ok(L?.handoff?.reason === "no_source" && L.handoff.note === "در داده نبود" && L.answer === "", "lines: handoff with note");
L = parseLines("Source: Calculator\nHandoff: NONE\n---\nقیمت تخمینی");
ok(L?.source === "calculator" && L.handoff === null, "lines: case-insensitive");
ok(parseLines("source: greeting\nhandoff: none\n---\nسلام") === null && parseDecision("source: greeting\n---\nسلام") === null, "lines: unknown source still rejected");
ok(parseDecision('{"answer":"x","source":"general","handoff":null}')?.answer === "x", "JSON still accepted (old format)");
ok(parseLines("فقط متن بدون سرآیند") === null, "lines: no header → null");

// ---- حجم داده‌های سایت (بخش ۳۲)
const prod = {
  slug: "x",
  title: "محصول",
  summary: null,
  description: "د".repeat(2000),
  specs: Array.from({ length: 25 }, (_, i) => ({ label: `ویژگی ${i}`, value: "مقدار" })),
  moq: 100,
  leadTimeDays: null,
  landedAtMoq: { available: false },
};
let sp = shapeProduct(prod, false);
ok(sp.description.length === LIMITS.descriptionChars + 1 && sp.specs.length === LIMITS.specs, "product: description and specs capped");
ok(!("summary" in sp) && !("leadTimeDays" in sp) && !("landedAtMoq" in sp), "product: no empty fields; no price unless asked");
ok("landedAtMoq" in shapeProduct(prod, true), "product: price included for price questions");
ok(
  shapeKb(Array.from({ length: 5 }, () => ({ question: "س", answer: "ج".repeat(900) }))).every((k, i, a) => a.length === LIMITS.kbItems && k.a.length === LIMITS.kbAnswerChars + 1),
  "kb: max 3 items, answers capped",
);
const hist = trimHistory(Array.from({ length: 10 }, (_, i) => ({ role: "user", content: String(i).repeat(1000) })));
ok(hist.length === LIMITS.historyMessages && hist[0].content.startsWith("4") && hist[0].content.length === LIMITS.historyChars + 1, "history: last 6, each capped");
ok(contextJson({ products: [], kb: [] }) === "{}" && !contextJson({ products: [{ slug: "a" }], kb: [] }).includes("null"), "context JSON: no empty keys");
ok(priceIntent("قیمتش چنده؟") && priceIntent("برای ۲۰۰ تا چقدر درمیاد") && !priceIntent("این دستگاه چند واته؟") && !priceIntent("جنسش چیه؟"), "price intent");

// ---- دستورالعمل انگلیسی همه‌ی قاعده‌های سخت را دارد (بخش ۳۲)
for (const k of [
  "SITE DATA",
  "Never invent",
  "proforma",
  "Alibaba",
  "1688",
  "forwarders",
  "HS code",
  "no link, email or phone",
  "«این بخش از خدمات یارچین است و کارشناس یارچین کمک می‌کند.»",
  "«این قیمت تخمینی است»",
  "no_source",
  "greeting",
  "Persian",
  "source:",
  "handoff:",
])
  ok(SYSTEM_PROMPT.includes(k), `prompt contains: ${k}`);
ok(
  SYSTEM_PROMPT.length < 3200 && (SYSTEM_PROMPT.match(/[\u0600-\u06FF]/g) || []).length < 150,
  `prompt is English (fa chars ${(SYSTEM_PROMPT.match(/[\u0600-\u06FF]/g) || []).length})`,
);

console.log(`${n} checks${fails ? `, ${fails} FAILED` : ", ALL PASSED"}`);
process.exitCode = fails ? 1 : 0;
