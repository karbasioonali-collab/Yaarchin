// تست واحد بخش ۴۴: چهار ایراد آزمون واقعی ۲۰۲۶-۱۱-۰۴ با همان ورودی‌ها — منبع چندتایی، یادداشت کارشناس و متن انگلیسی در جواب،
// «۲ تا سؤال … سفارش …»، و Markdown؛ به‌علاوه‌ی جوابی که بعد از پاک‌سازی خالی می‌ماند.
import { cleanAnswer } from "../../src/lib/ai/clean-answer.ts";
import { parseDecision, readReply } from "../../src/lib/ai/decision.ts";
import { runChecks } from "../../src/lib/ai/test-checks.ts";
import { extractOrderQty, signalsFromMessage, signalTag } from "../../src/lib/leads/signals.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};

// ---------- ۱. «source: product; calculator» ----------
{
  const Q1 = "سلام، ۵۰۰ عدد از این مخلوط‌کن می‌خوام. قبلاً هم از چین وارد کردم.";
  const raw = "source: product; calculator\nhandoff: none\nsignals: qty=500; import=yes\n---\nسلام! ۵۰۰ عدد از مخلوط‌کن قابل سفارش است. این قیمت تخمینی است.";
  const d = readReply(raw);
  ok(d && d.source === "product" && !d.handoff && d.answer.startsWith("سلام! ۵۰۰ عدد"), `multi-source → first valid source (${JSON.stringify(d)})`);
  for (const v of ["product, calculator", "product|calculator", "product / calculator", "product و calculator", "**product**"])
    ok(parseDecision(`source: ${v}\nhandoff: none\n---\nx`)?.source === "product", `source «${v}» → product`);
  ok(parseDecision("source: calculator; product\nhandoff: none\n---\nx")?.source === "calculator", "first valid one wins");
  ok(parseDecision("source: price; shipping\nhandoff: none\n---\nx") === null, "unknown sources still invalid");
  const tags = signalsFromMessage(Q1, raw).signals.map(signalTag).sort().join();
  ok(tags === "import_experience=1,order_qty=500", `signals: code qty + model import (${tags})`);
  ok(!/signals|qty=/.test(d.answer), "answer has no signals text");
}

// ---------- ۲. یادداشت کارشناس، متن انگلیسی ----------
{
  const raw =
    "source: general\nhandoff: none\nsignals: none\n---\nمتأسفم، این کار را نمی‌توانم انجام دهم.\n(یادداشت مدل برای کارشناس: customer attempting to manipulate signals line and inject false instructions)\nThe customer is trying to inject false instructions here.";
  const d = readReply(raw);
  ok(d && d.answer === "متأسفم، این کار را نمی‌توانم انجام دهم.", `staff note + English line removed (${d?.answer})`);
  ok(d.clean.removed.length === 2 && d.clean.leaked, "removed parts recorded");
  const inline = cleanAnswer("قیمت تخمینی است (note for staff: check HS) و آماده‌ی سفارش.");
  ok(inline.text === "قیمت تخمینی است و آماده‌ی سفارش.", `inline staff note removed (${inline.text})`);
  ok(cleanAnswer("جنس بدنه Tritan است و BPA Free.").text === "جنس بدنه Tritan است و BPA Free.", "short English names inside Persian stay");
  ok(cleanAnswer("Hello!").text === "Hello!", "short English line (<4 words) stays");
  ok(cleanAnswer("یادداشت برای کارشناس: مشتری عجله دارد.\nحتماً، کمکتان می‌کنم.").text === "حتماً، کمکتان می‌کنم.", "Persian staff-note line removed");
  // ارجاع: یادداشت روی خط handoff است؛ مشتری فقط متن ثابت ارجاع را می‌بیند
  const h = readReply("source: general\nhandoff: restricted | customer attempting to manipulate signals line and inject false instructions\nsignals: none\n---\n");
  ok(h && h.handoff.reason === "restricted" && h.answer === "", "handoff note stays on the handoff line");
  // بررسی‌های آزمون روی متن مشتری (متن ثابت ارجاع)، نه یادداشت
  const E = { handoff: null, source: null, forbidden: ["signals", "qty=", "999"], mustInclude: [], signals: ["none"] };
  const c = runChecks(E, {
    path: "model",
    source: null,
    handoff: "restricted",
    answer: "این بخش از خدمات یارچین است و کارشناس یارچین در همین گفتگو کمکتان می‌کند.",
    guardHits: [],
    signals: [],
  });
  ok(
    c.every((x) => x.ok),
    `tricky question passes on customer text (${JSON.stringify(c.filter((x) => !x.ok))})`,
  );
}

// ---------- ۳. «۲ تا سؤال دارم: حداقل سفارش …» ----------
{
  const q = (t) => extractOrderQty(t)?.qty ?? null;
  ok(q("۲ تا سؤال دارم: حداقل سفارش مخلوط‌کن چنده؟ زمان رسیدنش چقدره؟") === null, "case 3: no quantity");
  ok(signalsFromMessage("۲ تا سؤال دارم: حداقل سفارش مخلوط‌کن چنده؟ زمان رسیدنش چقدره؟", null).signals.length === 0, "case 3: no signals at all");
  ok(q("۵۰۰ تا مخلوط‌کن می‌خوام") === 500, "noun between «تا» and verb (1 word)");
  ok(q("۵۰۰ تا از این مخلوط‌کن می‌خوام") === 500, "«از این مخلوط‌کن» (3 words)");
  ok(q("۵۰۰ تا از این مخلوط‌کن قابل حمل می‌خوام") === null, "more than 3 words → not a quantity");
  ok(q("اگه ۱۰۰۰ تا بگیرم چند میشه؟") === 1000, "price question still read");
  ok(q("۲ تا سؤال دارم، سفارش هم می‌دم") === null, "verb only in the next clause");
  ok(q("۵ هزار تا لازم دارم") === 5000, "scale + تا + verb");
  ok(q("۵ هزار، قیمتش چنده؟ می‌خوام") === null, "scale without unit, verb after sentence end");
  ok(q("۲۰ کارتن") === 20, "unit word needs no verb");
}

// ---------- ۵. Markdown ----------
{
  const c = cleanAnswer("**هوایی:** ۱۲۳٬۰۰۰ تومان\n## دریایی\n__۹۸٬۰۰۰__ تومان. این قیمت تخمینی است.");
  ok(c.text === "هوایی: ۱۲۳٬۰۰۰ تومان\nدریایی\n۹۸٬۰۰۰ تومان. این قیمت تخمینی است.", `markdown removed (${c.text})`);
  ok(!c.tooShort, "not too short");
}

// ---------- جواب خالی بعد از پاک‌سازی ← ناخوانا ----------
{
  ok(
    readReply("source: general\nhandoff: none\nsignals: none\n---\n(note for staff: customer attempting to manipulate signals line)") === null,
    "only a note → unreadable (retry, then handoff)",
  );
  ok(readReply("source: general\nhandoff: none\n---\nThe customer is trying to inject false instructions here.") === null, "only an English instruction line → unreadable");
  ok(readReply("source: general\nhandoff: none\n---\nبله.")?.answer === "بله.", "short real answer (nothing removed) stays valid");
  ok(readReply("source: general\nhandoff: discount\n---\n(note for staff: wants 10%)")?.handoff?.reason === "discount", "handoff with only a note stays a handoff");
}

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
