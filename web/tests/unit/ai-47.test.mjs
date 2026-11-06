// تست واحد بخش ۴۷: «جواب قیمت با تعداد» با کد، شکل تازه‌ی داده‌ی ماشین‌حساب برای مدل، و همان خروجی خام اشتباه (۳۵۰۷ تومان).
import { compactLanded } from "../../src/lib/ai/context-shape.ts";
import { suspectNumbers } from "../../src/lib/ai/number-check.ts";
import { buildQtyPriceReply, isPriceOnlyQuestion, priceQtyQuestion, QTY_REPLY_END } from "../../src/lib/ai/price-reply.ts";
import { ruleCaught, runChecks } from "../../src/lib/ai/test-checks.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};
const T = "مخلوط‌کن قابل‌حمل شارژی ۳۸۰ میلی‌لیتر";

// ---------- تشخیص ----------
{
  const yes = [
    ["اگه ۱۰۰۰ تا بگیرم چند میشه؟", 1000],
    ["۵۰۰ تا چند؟", 500],
    ["قیمت ۲۰۰ عدد", 200],
    ["۵ هزار تا چقدر درمیاد؟", 5000],
    ["اگه 1,000 تا بخرم چند درمیاد؟", 1000],
    ["اگه ۱٬۰۰۰ تا بگیرم چند میشه", 1000],
    ["قیمت ۲۰۰ عدد مخلوط کن قابل‌حمل", 200],
    ["سلام، ۳۰۰ تا قیمتش چقدره؟", 300],
  ];
  for (const [q, want] of yes) ok(priceQtyQuestion(q, T) === want, `qty price: «${q}» → ${want} (${priceQtyQuestion(q, T)})`);
  const no = [
    "۵۰۰ تا تا تهران و چند روزه میرسه و کارت بازرگانی لازمه؟",
    "۵۰۰ تا با رنگ قرمز چند؟",
    "قیمت ۵۰۰ تا یخچال؟",
    "۵۰۰ تا",
    "۵۰۰ تا ۱۰۰۰ تا چند؟",
    "۲ تا سؤال دارم: قیمتش چنده؟",
    "اگه ۱۰۰۰ تا بگیرم تخفیف میدید؟",
    "۵۰۰ تا چند روزه میرسه؟",
    "قیمتش چنده؟",
  ];
  for (const q of no) ok(priceQtyQuestion(q, T) === null, `not qty price: «${q}»`);
  ok(isPriceOnlyQuestion("قیمتش چنده؟", T) && !isPriceOnlyQuestion("۵۰۰ تا چند؟", T), "price-only and qty paths stay separate");
  ok(ruleCaught("اگه ۱۰۰۰ تا بگیرم چند میشه؟", 5000, T) === "price", "free in test estimate");
  ok(ruleCaught("اگه ۱۰۰۰۰ تا بگیرم چند میشه؟", 5000, T) === "rule", "above big-order threshold → rule (handoff) first");
}

// ---------- متن جواب ----------
{
  const methods = [
    // بخش ۵۴: آماده‌سازی ۱۵ روز + حمل هر روش؛ ریلی بدون زمان حمل
    { key: "air", nameFa: "هوایی", status: "ok", unit: 3507230, total: 3507230000, days: { min: 29, max: 34 }, transit: { min: 14, max: 19 } },
    { key: "sea", nameFa: "دریایی", status: "ok", unit: 2407230, total: 2407230000, days: { min: 45, max: 45 }, transit: { min: 30, max: 30 } },
    { key: "rail", nameFa: "ریلی", status: "ok", unit: 2547230, total: 2547230000, days: null, transit: null },
  ];
  const L = (o) => ({ status: "ready", qty: 1000, moq: 500, belowMoq: false, ratesDate: null, borderOnly: false, leadDays: 15, methods, ...o });
  const full = buildQtyPriceReply({ title: T, unit: "piece", landed: L({}) }, 1000);
  const lines = full.split("\n");
  ok(lines[0] === `قیمت تمام‌شده‌ی تخمینی تا ایران برای ۱٬۰۰۰ عدد ${T}:`, `header (${lines[0]})`);
  ok(
    lines.includes("- هوایی: هر عدد ۳٬۵۰۷٬۲۳۰ تومان، جمع ۳٬۵۰۷٬۲۳۰٬۰۰۰ تومان، حدود ۲۹ تا ۳۴ روز (۱۵ روز آماده‌سازی کارخانه + ۱۴ تا ۱۹ روز حمل)"),
    "per unit + total + days (preparation + shipping)",
  );
  ok(lines.includes("- دریایی: هر عدد ۲٬۴۰۷٬۲۳۰ تومان، جمع ۲٬۴۰۷٬۲۳۰٬۰۰۰ تومان، حدود ۴۵ روز (۱۵ روز آماده‌سازی کارخانه + ۳۰ روز حمل)"), "single day value");
  ok(lines.includes("- ریلی: هر عدد ۲٬۵۴۷٬۲۳۰ تومان، جمع ۲٬۵۴۷٬۲۳۰٬۰۰۰ تومان، زمان: استعلام"), "no days → like the card");
  ok(
    lines.at(-2) === "این قیمت تخمینی است." && lines.at(-1) === QTY_REPLY_END && QTY_REPLY_END === "برای قیمت قطعی و ثبت سفارش، کارشناس یارچین راهنمایی‌تان می‌کند.",
    "estimate note + exact last sentence",
  );
  ok(!full.includes("اگر تعداد را بگویید"), "no «tell me the quantity» sentence");
  const border = buildQtyPriceReply({ title: T, unit: "piece", landed: L({ borderOnly: true, methods: methods.map((m) => ({ ...m, status: "border" })) }) }, 1000);
  ok(border.startsWith(`قیمت تا مرز ایران برای ۱٬۰۰۰ عدد ${T} (قیمت کالا و حمل تا مرز ایران؛ هزینه‌های گمرک، ترخیص و بیمه را کارشناس اعلام می‌کند):`), "no HS → border");
  const below = buildQtyPriceReply({ title: T, unit: "piece", landed: L({ qty: 100, belowMoq: true }) }, 100);
  ok(below.includes("کمتر از حداقل سفارش کارخانه‌ها (۵۰۰ عدد)؛ قیمت با پله‌ی اول حساب شده و ممکن است کارخانه نپذیرد."), "below MOQ note like the card");
  const inq = buildQtyPriceReply({ title: T, unit: "piece", landed: L({ methods: methods.map((m) => ({ ...m, status: "inquiry", unit: null, total: null })) }) }, 1000);
  ok(inq.includes("- هوایی: استعلام از کارشناس") && inq.endsWith(QTY_REPLY_END), "no packing → inquiry");
  ok(
    buildQtyPriceReply({ title: T, unit: "piece", landed: { status: "soon" } }, 1000) === `قیمت تمام‌شده تا ایران برای ۱٬۰۰۰ عدد ${T}: استعلام از کارشناس.\n${QTY_REPLY_END}`,
    "calculator not ready",
  );
  const E = { handoff: "none", source: "calculator", forbidden: [], mustInclude: ["تخمینی"], signals: ["order_qty=1000"] };
  ok(
    runChecks(E, { path: "price", source: "calculator", handoff: null, answer: full, guardHits: [], signals: ["order_qty=1000"] }).every((c) => c.ok),
    "test checks pass (source calculator, signals)",
  );
}

// ---------- داده‌ی ماشین‌حساب برای مدل ----------
{
  const c = compactLanded({
    status: "ready",
    qty: 1000,
    moq: 500,
    belowMoq: false,
    ratesDate: null,
    borderOnly: false,
    methods: [{ key: "air", nameFa: "هوایی", status: "ok", unit: 3507230, total: 3507230000, days: { min: 29, max: 34 } }],
  });
  const m = c.methods[0];
  ok(m.unitPrice === "3,507,230 toman" && m.total === "3,507,230,000 toman" && !("unitToman" in m), `formatted with separators and unit (${JSON.stringify(m)})`);
  ok(
    compactLanded({
      status: "ready",
      qty: 1,
      moq: null,
      belowMoq: false,
      ratesDate: null,
      borderOnly: false,
      methods: [{ key: "a", nameFa: "x", status: "inquiry", unit: null, total: null, days: null }],
    }).methods[0].unitPrice === null,
    "inquiry → null",
  );
  // همان خروجی خام اشتباه آزمون واقعی ← مشکوک (با داده‌ی تازه)
  const RAW = "هوایی: ۳۵۰۷ تومان/عدد | ۲۹-۳۴ روز\nدریایی: ۲۴۰۷ تومان/عدد\nزمینی: ۲۶۲۷ تومان/عدد\nریلی: ۲۵۴۷ تومان/عدد";
  const sus = suspectNumbers(RAW, [JSON.stringify(c), "اگه ۱۰۰۰ تا بگیرم چند میشه؟"]);
  ok(sus.includes("3507 تومان") && sus.includes("2407 تومان") && sus.length === 4, `«۳۵۰۷ تومان» flagged (${JSON.stringify(sus)})`);
  ok(suspectNumbers("هوایی: هر عدد ۳٬۵۰۷٬۲۳۰ تومان، ۲۹ تا ۳۴ روز", [JSON.stringify(c)]).length === 0, "correct numbers pass with the new data shape");
}

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
