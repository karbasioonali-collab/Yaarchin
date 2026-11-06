// تست واحد بخش ۵۳: سه باگ نشانه‌ها (تعداد با سؤال قیمت، بودجه با واحد فارسی و از متن مشتری، کانال اینترنتی)
// و بهبودها (عدد بی‌واحد، یکسان‌سازی جواب، جواب زمان حمل با کد، دستورالعمل). جمله‌ها همان آزمون واقعی ۲۰۲۶-۱۱-۰۶.
import { readFileSync } from "node:fs";
import { readReply } from "../../src/lib/ai/decision.ts";
import { claimsOf, suspectNumbers } from "../../src/lib/ai/number-check.ts";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "../../src/lib/ai/prompt.ts";
import { buildTimeReply, isPriceOnlyQuestion, isTimeOnlyQuestion, priceQtyQuestion, TIME_REPLY_END } from "../../src/lib/ai/price-reply.ts";
import { timeIntent } from "../../src/lib/ai/context-shape.ts";
import { budgetWords, extractBudget, extractOrderQty, onlineChannel, parseSignalsLine, qtyAttached, signalsFromMessage, signalTag } from "../../src/lib/leads/signals.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};
const R = { usd: 100000, cny: 14000 };
const tags = (text, model = null) => signalsFromMessage(text, model, R).signals.map(signalTag).join(",");
const MSG1 = "۵۰۰ تا چند میشه؟";
const MSG2 = "حدود ۱ میلیارد سرمایه دارم و فروشگاه اینترنتی دارم";
const MODEL2 = "source: general\nhandoff: other | serious budget\nsignals: budget=1 میلیارد toman; channel=shop\n---\n";

// ---------- ۱. تعداد با سؤال قیمت ----------
const q1 = extractOrderQty(MSG1);
ok(q1 && q1.qty === 500 && q1.priceQuestion, `«${MSG1}» → 500 (price question)`);
ok(tags(MSG1) === "order_qty=500", "recorded by code (customer API, every path incl. human chat)");
ok(extractOrderQty("اگه ۱۰۰۰ تا بگیرم چند میشه؟")?.qty === 1000 && extractOrderQty("۵۰۰ تا مخلوط‌کن تا تهران چقدر درمیاد؟")?.qty === 500, "earlier forms still work");
ok(extractOrderQty("۲ تا سؤال دارم قیمتش چنده؟") === null && extractOrderQty("۲ تا سؤال دارم: حداقل سفارش چنده؟") === null, "«۲ تا سؤال دارم …قیمت» is not a quantity");
ok(extractOrderQty("۱۰ تا ۲۰ روز طول میکشه؟") === null && extractOrderQty("۳ تا مدل دارید، قیمتش چنده") === null, "range and «۳ تا مدل» not a quantity");
ok(qtyAttached(MSG1, 500), "model qty=500 accepted for the same sentence");
ok(priceQtyQuestion(MSG1, "مخلوط‌کن قابل حمل") === 500, "same message → qty price answer by code (calculator)");

// ---------- ۲. بودجه ----------
const bw = (v) => JSON.stringify(parseSignalsLine(`signals: budget=${v}`).budget ?? null);
ok(bw("1 میلیارد toman") === '{"amount":1,"scale":"billion","currency":"toman"}', `model line «1 میلیارد toman» (${bw("1 میلیارد toman")})`);
ok(
  bw("200 million تومان") === '{"amount":200,"scale":"million","currency":"toman"}' && bw("1میلیارد تومن") === '{"amount":1,"scale":"billion","currency":"toman"}',
  "mixed English/Persian, no space",
);
ok(
  bw("5 billion ریال") === '{"amount":5,"scale":"billion","currency":"rial"}' && bw("50 هزار دلار") === '{"amount":50,"scale":"thousand","currency":"usd"}',
  "rial and dollar in Persian",
);
ok(
  bw("200 thousand toman") === '{"amount":200,"scale":"thousand","currency":"toman"}' && bw("3 billion") === '{"amount":3,"scale":"billion","currency":"toman"}',
  "English unchanged",
);
ok(budgetWords("1 ملیارد تومن") === "1 billion toman", "misspelled ملیارد");
ok(JSON.stringify(extractBudget(MSG2)) === '{"amount":1,"scale":"billion","currency":"toman"}', "budget read by code from the customer text");
ok(extractBudget("قیمتش ۱ میلیون تومنه؟") === null && extractBudget("۵۰۰ تا چند میشه؟") === null, "a price is not a budget (no budget word)");
ok(tags("۲۰۰ تومن سرمایه دارم، با این پول چی میشه وارد کرد؟") === "budget_unclear", "«۲۰۰ تومن» → unclear (same rule)");
ok(tags("بودجم ۵ میلیارد ریاله") === "budget_mtoman=500" && tags("۵۰ هزار دلار سرمایه دارم") === "budget_mtoman=5000", "rial ÷ 10, dollar × market rate");
ok(tags("۱.۵ میلیارد تومان سرمایه دارم") === "budget_mtoman=1500" && tags("۱٫۵ میلیارد تومان بودجه دارم") === "budget_mtoman=1500", "decimal point is not a sentence end");

// ---------- ۳. کانال اینترنتی ----------
ok(tags(MSG2) === "budget_mtoman=1000,sales_channel=online", `message 2 without model (human chat): ${tags(MSG2)}`);
ok(tags(MSG2, MODEL2) === "budget_mtoman=1000,sales_channel=online", `message 2 with the real model line (channel=shop overridden): ${tags(MSG2, MODEL2)}`);
for (const t of ["فروشگاه اینترنتی دارم", "اینترنتی می‌فروشم", "پیج اینستاگرام دارم", "تو دیجی‌کالا غرفه دارم", "فروش آنلاین دارم", "سایت خودم رو دارم", "توی باسلام می‌فروشم"])
  ok(onlineChannel(t), `online: «${t}»`);
for (const t of ["توی سایت شما دیدم", "مغازه دارم", "عمده‌فروشی دارم", "قیمت چنده؟"]) ok(!onlineChannel(t), `not online: «${t}»`);
ok(tags("مغازه دارم", "source: general\nhandoff: none\nsignals: channel=shop\n---\nسلام") === "sales_channel=shop", "physical store → model's shop kept");

// ---------- ۴. عدد بی‌واحد ----------
const SRC = ['{"methods":[{"method":"زمینی","unitPrice":"340,000 toman","days":{"min":20,"max":30}}],"moq":500}'];
ok(suspectNumbers("قیمت با حمل:\n- زمینی: ۳۹۷", SRC).join() === "397", "«زمینی: ۳۹۷» flagged");
ok(suspectNumbers("قیمت با حمل:\n- زمینی: ۳۴۰", SRC).length === 0, "«زمینی: ۳۴۰» = 340,000 short form → ok");
ok(suspectNumbers("زمینی: ۵۵۰ هزار", SRC).join() === "550 هزار" && suspectNumbers("زمینی: ۳۴۰ هزار", SRC).length === 0, "«… هزار» without currency is money");
ok(suspectNumbers("حداقل سفارش ۵۰۰ عدد، حمل زمینی ۲۰ تا ۳۰ روز", SRC).length === 0, "quantity and days unaffected");
ok(claimsOf("1. حمل زمینی\n2. حمل هوایی").length === 0 && claimsOf("هزینه‌ی حمل ۱۵ درصد").length === 0, "list numbers and percent not checked");
ok(claimsOf("این مدل ۳ سرعته است و ۴۰۰ وات").length === 0, "lines without price/shipping words not checked");

// ---------- ۵. یکسان‌سازی جواب ----------
const rr = readReply("source: product\nhandoff: none\nsignals: none\n---\nاين محصول را مي توانيد با حمل زميني تهيه كنيد ؛ قيمت ٣٩٧");
ok(rr && rr.answer === "این محصول را می‌توانید با حمل زمینی تهیه کنید؛ قیمت ۳۹۷", `answer normalized (${rr?.answer})`);
ok(suspectNumbers(rr.answer, SRC).join() === "397", "Arabic digits checked after normalization");

// ---------- ۷. زمان حمل با کد ----------
const T = "مخلوط‌کن قابل حمل";
for (const q of ["چقدر طول می‌کشه برسه؟", "کی می‌رسه؟", "چند روزه میرسه دستم؟", "زمان حمل چقدره؟", "سلام، چقدر طول میکشه تا برسه ایران؟"])
  ok(isTimeOnlyQuestion(q, T), `time question: «${q}»`);
for (const q of ["۵۰۰ تا چند روزه میرسه؟", "قیمتش چنده؟", "چند روز گارانتی داره؟", "رنگ قرمز کی میرسه؟", "ارسال به شهرستان دارید؟"])
  ok(!isTimeOnlyQuestion(q, T), `not time-only: «${q}»`);
ok(!isPriceOnlyQuestion("چقدر طول می‌کشه برسه؟", T), "time question is not a price question");
const landed = {
  status: "ready",
  methods: [
    { nameFa: "هوایی", status: "ok", unit: 1, total: 1, days: { min: 7, max: 10 } },
    { nameFa: "زمینی", status: "ok", unit: 1, total: 1, days: { min: 20, max: 20 } },
    { nameFa: "ریلی", status: "inquiry", unit: null, total: null, days: { min: 30, max: 40 } },
    { nameFa: "دریایی", status: "ok", unit: 1, total: 1, days: null },
  ],
};
const tr = buildTimeReply({ title: T, landed });
ok(tr === `زمان تقریبی رسیدن ${T} به ایران:\n- هوایی: ۷ تا ۱۰ روز\n- زمینی: حدود ۲۰ روز\n${TIME_REPLY_END}`, `time reply from product data (${tr})`);
ok(
  buildTimeReply({ title: T, landed: { status: "soon" } }) === null &&
    buildTimeReply({ title: T, landed: { status: "ready", methods: [{ nameFa: "x", status: "ok", days: null }] } }) === null,
  "no days → model path",
);
ok(timeIntent("۵۰۰ تا چند روزه میرسه؟") && timeIntent("زمان تحویل چقدره") && !timeIntent("قیمت چنده"), "mixed messages: shipping days sent to the model");

// ---------- دستورالعمل و seed ----------
ok(
  PROMPT_VERSION === "2026-11-08.1" &&
    /product data wins over the knowledge base/.test(SYSTEM_PROMPT) &&
    /online = any internet selling, incl\. an online store; shop = physical store only/.test(SYSTEM_PROMPT),
  "prompt: product-data priority and channel mapping",
);
const drafts = JSON.parse(readFileSync(new URL("../../src/db/test-drafts.json", import.meta.url), "utf8"));
const byQ = (q) => drafts.find((d) => d.question === q);
ok(byQ(MSG1)?.addIfMissing && byQ(MSG1).expect.signals.join() === "order_qty=500" && byQ(MSG1).expect.source === "calculator", "test case: «۵۰۰ تا چند میشه؟»");
ok(
  byQ(MSG2)?.addIfMissing && byQ(MSG2).expect.signals.join() === "budget_mtoman=1000,sales_channel=online" && byQ(MSG2).expect.handoff === null,
  "test case: budget + online (hand-off allowed)",
);
// «چقدر طول می‌کشه برسه؟» از قبل سؤال آزمون شماره‌ی ۴ است (منبع product)؛ حالا با جواب زمان حمل با کد قبول می‌شود
ok(
  byQ("چقدر طول می‌کشه برسه؟")?.expect.source === "product" &&
    byQ("چقدر طول می‌کشه برسه؟").productSlug === "portable-blender" &&
    drafts.filter((d) => d.question === "چقدر طول می‌کشه برسه؟").length === 1,
  "delivery-time test case (#4, once)",
);
const fake = readFileSync(new URL("../../src/lib/ai/fake.ts", import.meta.url), "utf8");
ok(fake.includes("[[bare]]") && readFileSync(new URL("../e2e/mock-ai.mjs", import.meta.url), "utf8").includes("[[bare]]"), "[[bare]] in the fake model and the e2e mock");

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
