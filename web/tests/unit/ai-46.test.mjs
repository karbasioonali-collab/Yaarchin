// تست واحد بخش ۴۶: «جواب قیمت با کد»، قالب برعکس، «عدد خارج از داده».
import { readReply } from "../../src/lib/ai/decision.ts";
import { claimsOf, suspectNumbers } from "../../src/lib/ai/number-check.ts";
import { buildPriceReply, isPriceOnlyQuestion, PRICE_REPLY_END } from "../../src/lib/ai/price-reply.ts";
import { estimateRun, ruleCaught, runChecks } from "../../src/lib/ai/test-checks.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};

// ---------- تشخیص سؤال قیمت ----------
{
  const T = "مخلوط‌کن قابل حمل";
  const yes = [
    "قیمت مخلوط‌کن قابل حمل چنده؟",
    "قیمت مخلوط کن قابل‌حمل چنده؟",
    "قیمت مخلوط کن قابل حمل چنده",
    "قیمت مخلوطكن قابل حمل چنده؟",
    "قيمت مخلوط‌کن قابل حمل چنده؟",
    "قیمتش چنده؟",
    "چند؟",
    "قیمت؟",
    "سلام، قیمت این محصول چقدره؟",
    "هر عدد چند تومنه؟",
    "قیمت مخلوط‌کن چنده",
    "ببخشید قیمتش چقدره لطفاً",
  ];
  const no = [
    "۵۰۰ تا چند؟",
    "500 تا چند؟",
    "قیمت تا تهران؟",
    "چند روزه میرسه؟",
    "قیمت عمده‌اش؟",
    "قیمت یخچال چنده؟",
    "حداقل سفارش چنده؟",
    "قیمت حمل چنده؟",
    "چند تا رنگ داره؟",
    "FOB یعنی چی؟",
    "قیمت با ارسال چنده؟",
    "تخفیف میدید؟ قیمتش چنده",
    "قیمتش چنده؟ کارت بازرگانی لازمه؟",
  ];
  for (const q of yes) ok(isPriceOnlyQuestion(q, T), `price-only: «${q}»`);
  for (const q of no) ok(!isPriceOnlyQuestion(q, T), `not price-only: «${q}»`);
  // عدد داخل عنوان (فارسی یا لاتین) با عنوان حذف می‌شود
  ok(isPriceOnlyQuestion("قیمت ترازو ۳۰ کیلویی چنده؟", "ترازو 30 کیلویی"), "Persian digits in title");
  ok(isPriceOnlyQuestion("قیمت ترازو 30 کیلویی چنده؟", "ترازو ۳۰ کیلویی"), "Latin digits in title");
  ok(!isPriceOnlyQuestion("قیمت ترازو ۳۰ کیلویی برای ۱۰ عدد چنده؟", "ترازو ۳۰ کیلویی"), "quantity outside the title");
}

// ---------- متن جواب قیمت ----------
{
  const base = {
    title: "مخلوط‌کن قابل حمل",
    unit: "piece",
    price: { avg: 2.35, refQty: 100, moqFrom: 50, tierMin: 2.1, tierMax: 2.6 },
    toman: { avg: 234567, rateDate: "2026-11-06", isToday: true },
  };
  const methods = [
    { key: "air", nameFa: "هوایی", status: "ok", unit: 3712000, total: 371200000, days: { min: 22, max: 27 } },
    { key: "sea", nameFa: "دریایی", status: "ok", unit: 2100000, total: 210000000, days: { min: 45, max: 45 } },
  ];
  const full = buildPriceReply({ ...base, landed: { status: "ready", qty: 100, moq: 50, belowMoq: false, ratesDate: null, borderOnly: false, methods } });
  ok(full.includes("قیمت مخلوط‌کن قابل حمل در سایت برای سفارش ۱۰۰ عدد: هر عدد ۲٫۳۵ دلار (معادل ۲۳۴٬۵۷۰ تومان با نرخ امروز دلار)."), `site price + toman (${full.split("\n")[0]})`);
  ok(full.includes("حداقل سفارش از ۵۰ عدد | قیمت از ۲٫۱۰ تا ۲٫۶۰ دلار، بسته به تعداد."), "moq + range");
  ok(
    full.includes("قیمت تمام‌شده‌ی تخمینی تا ایران برای ۱۰۰ عدد:") &&
      full.includes("- هوایی: هر عدد ۳٬۷۱۲٬۰۰۰ تومان، ۲۲ تا ۲۷ روز") &&
      full.includes("- دریایی: هر عدد ۲٬۱۰۰٬۰۰۰ تومان، حدود ۴۵ روز"),
    "all methods like the product page",
  );
  ok(
    full.includes("این قیمت تخمینی است.") && full.endsWith(PRICE_REPLY_END) && PRICE_REPLY_END === "اگر تعداد را بگویید، دقیق‌تر حساب می‌کنم.",
    "estimate note + exact last sentence",
  );
  const border = buildPriceReply({
    ...base,
    landed: { status: "ready", qty: 100, moq: 50, belowMoq: false, ratesDate: null, borderOnly: true, methods: methods.map((m) => ({ ...m, status: "border" })) },
  });
  ok(
    border.includes("قیمت تا مرز ایران برای ۱۰۰ عدد (قیمت کالا و حمل تا مرز ایران؛ هزینه‌های گمرک، ترخیص و بیمه را کارشناس اعلام می‌کند):") && !border.includes("تمام‌شده"),
    "no HS → border wording",
  );
  const inq = buildPriceReply({
    ...base,
    landed: {
      status: "ready",
      qty: 100,
      moq: 50,
      belowMoq: false,
      ratesDate: null,
      borderOnly: false,
      methods: methods.map((m) => ({ ...m, status: "inquiry", unit: null, total: null })),
    },
  });
  ok(inq.includes("- هوایی: استعلام از کارشناس") && inq.includes("- دریایی: استعلام از کارشناس"), "no packing → inquiry per method");
  ok(buildPriceReply({ ...base, landed: { status: "soon" } }).includes("قیمت تمام‌شده تا ایران: استعلام از کارشناس."), "calculator not ready → inquiry");
  ok(buildPriceReply({ ...base, toman: { avg: 234567, rateDate: "2026-11-03", isToday: false }, landed: { status: "soon" } }).includes("با نرخ ۱۲ آبان"), "old rate → date");
  ok(buildPriceReply({ ...base, price: null, landed: { status: "soon" } }) === null, "no price → null (normal path)");
  // آزمون: منبع «محصول» و بررسی‌ها قبول (همان انتظار سؤال ۱)
  const E = { handoff: "none", source: "product|calculator", forbidden: [], mustInclude: ["تخمینی"] };
  ok(
    runChecks(E, { path: "price", source: "product", handoff: null, answer: full, guardHits: [] }).every((c) => c.ok),
    "test case 1 passes on the price path",
  );
  ok(
    ruleCaught("قیمت مخلوط‌کن قابل حمل چنده؟", 5000, "مخلوط‌کن قابل حمل") === "price" && ruleCaught("قیمت مخلوط‌کن قابل حمل چنده؟", 5000) === null,
    "free in estimate only with product title",
  );
  ok(
    estimateRun([{ question: "قیمتش چنده؟", productTitle: "مخلوط‌کن" }, "FOB یعنی چی؟"], { bigOrderQty: 5000, avgToman: 1000, live: true }).free === 1,
    "estimate counts price questions as free",
  );
}

// ---------- قالب برعکس ----------
{
  const RAW =
    "برای ۱۰۰ عدد:\n**هوایی:** ۴۴۴ میلیون تومان (۱۷ تا ۲۲ روز)\n**دریایی:** ۳۸۱ میلیون تومان\n**زمینی:** ۳۴۰ میلیون تومان\n**ریلی:** ۳۳۶ میلیون تومان\nاین قیمت تخمینی است.\n\nsource: product\nhandoff: none\nsignals: none";
  ok(readReply(RAW) === null, "reversed format (real raw output) → unreadable → retry");
  ok(readReply("source: general\nhandoff: none\nsignals: none\n---\n") === null, "empty answer without handoff → unreadable");
  ok(readReply("source: general\nhandoff: restricted | x\n---\n")?.handoff?.reason === "restricted", "handoff with empty answer stays valid");
  ok(readReply("source: none\nhandoff: none\n---\n")?.source === "none", "source none with empty answer stays (→ no_source)");
  ok(readReply("signals: none\nsource: product\nhandoff: none\n---\nجواب")?.answer === "جواب", "signals line before source still fine");
  ok(readReply("```\nsource: product\nhandoff: none\n---\nجواب\n```")?.answer === "جواب", "code fence before source still fine");
}

// ---------- عدد خارج از داده ----------
{
  const data = JSON.stringify({
    landed: { qty: 100, methods: [{ nameFa: "هوایی", unitToman: 3712000, totalToman: 371200000, days: { min: 22, max: 27 } }] },
    price: { avg: 2.35, min: 2.1, max: 2.6, moq: 50 },
  });
  const RAW_ANSWER = "برای ۱۰۰ عدد:\nهوایی: ۴۴۴ میلیون تومان (۱۷ تا ۲۲ روز)\nدریایی: ۳۸۱ میلیون تومان\nزمینی: ۳۴۰ میلیون تومان\nریلی: ۳۳۶ میلیون تومان";
  const s = suspectNumbers(RAW_ANSWER, [data]);
  ok(s.includes("444 میلیون تومان") && s.includes("17 تا 22 روز") && s.length === 5, `invented prices and days (${JSON.stringify(s)})`);
  ok(suspectNumbers("هوایی هر عدد ۳٫۷ میلیون تومان، ۲۲ تا ۲۷ روز؛ جمع ۳۷۱٬۲۰۰٬۰۰۰ تومان.", [data]).length === 0, "rounded real values accepted (±2%)");
  ok(suspectNumbers("هر عدد ۲٫۳۵ دلار ($2.35)، از ۲٫۱ تا ۲٫۶ دلار.", [data]).length === 0, "USD values and ranges");
  ok(suspectNumbers("حداقل سفارش ۵۰ عدد. ۱. ثبت سفارش ۲. پرداخت. ۲۰ درصد پیش‌پرداخت.", [data]).length === 0, "quantities, list numbers, percents ignored");
  ok(suspectNumbers("حدود ۴ میلیون تومان", [data]).length === 1, "known risk: «حدود ۴ میلیون» for 3.7 million is flagged");
  ok(suspectNumbers("بودجه‌ی ۲۰۰ میلیون تومانی شما", [data, "۲۰۰ میلیون تومن سرمایه دارم"]).length === 0, "number from the customer's message allowed");
  ok(
    claimsOf("۳ تا ۵ میلیون تومان")
      .map((c) => c.value)
      .join() === "3000000,5000000",
    "money range with shared scale",
  );
  // بررسی آزمون
  const E = { handoff: null, source: null, forbidden: [], mustInclude: [] };
  const c1 = runChecks(E, { path: "model", source: "calculator", handoff: null, answer: "x", guardHits: [], suspectNumbers: ["444 میلیون تومان"] }).find(
    (c) => c.check === "numbers",
  );
  ok(c1 && !c1.ok && c1.detail === "444 میلیون تومان", "test check «عدد خارج از داده» fails");
  ok(
    runChecks(E, { path: "model", source: "calculator", handoff: null, answer: "x", guardHits: [], suspectNumbers: [] }).find((c) => c.check === "numbers").ok,
    "no suspects → passes",
  );
  ok(!runChecks(E, { path: "price", source: "product", handoff: null, answer: "x", guardHits: [] }).some((c) => c.check === "numbers"), "code answers are not checked");
}

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
