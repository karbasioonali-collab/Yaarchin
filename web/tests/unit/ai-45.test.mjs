// تست واحد بخش ۴۵: ایرادهای آزمون واقعی ۲۰۲۶-۱۱-۰۵ — خط handoff با توضیح بعد از none، دلیل other،
// تعدادِ مدل که باید به واحد یا فعل خرید چسبیده باشد، و نمایش تلاش‌ها.
import { parseDecision } from "../../src/lib/ai/decision.ts";
import { callLine, readRequestMeta } from "../../src/lib/ai/request-meta.ts";
import { HANDOFF_FA } from "../../src/lib/ai/rules.ts";
import { qtyAttached, signalsFromMessage, signalTag } from "../../src/lib/leads/signals.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};
const H = (line) => parseDecision(`source: product\n${line}\n---\nقیمت ۱۲۳ تومان است. این قیمت تخمینی است.`);

// ---------- ۵. خط handoff ----------
for (const l of ["handoff: none (price is in the data)", "handoff: none.", "handoff: **none**", "handoff: None — answered from product data", "handoff: no", "handoff: -"])
  ok(H(l) && H(l).handoff === null, `«${l}» → no handoff`);
ok(H("handoff: none | x")?.handoff === null, "none with note → no handoff");
{
  const d = H("handoff: no_source (not in data)");
  ok(d.handoff?.reason === "no_source" && d.handoff.note === "not in data", `reason = first word, rest = note (${JSON.stringify(d.handoff)})`);
  const o = H("handoff: other | wants to be a reseller");
  ok(o.handoff?.reason === "other" && o.handoff.note === "wants to be a reseller" && HANDOFF_FA.other === "دلیل دیگر (به تشخیص دستیار)", "other has its own label");
  ok(H("handoff: final_price | x")?.handoff?.reason === "final_price", "known reason unchanged");
  ok(HANDOFF_FA.truncated === "جواب دستیار ناقص بود", "truncated label");
}

// ---------- ۳. تعدادِ مدل: باید چسبیده باشد ----------
{
  const Q42 = "۲ تا سؤال دارم: حداقل سفارش مخلوط‌کن چنده؟ زمان رسیدنش چقدره؟";
  const r = signalsFromMessage(Q42, "signals: qty=2");
  ok(r.signals.length === 0, `case 3: model qty=2 rejected (${JSON.stringify(r.signals.map(signalTag))})`);
  ok(!qtyAttached(Q42, 2), "qtyAttached false for case 3");
  ok(signalsFromMessage("۵۰۰ می‌خوام", "signals: qty=500").signals.map(signalTag).join() === "order_qty=500", "number + buy verb → model qty accepted");
  ok(signalsFromMessage("حدود ۸۰۰ تا ازش لازمه", "signals: qty=800").signals.map(signalTag).join() === "order_qty=800", "«۸۰۰ تا ازش لازمه»");
  ok(signalsFromMessage("قبلاً ۳ بار خرید کردم", "signals: qty=3").signals.length === 0, "«۳ بار» is not a quantity");
  ok(signalsFromMessage("۲ تا محصول دیدم، یکیش رو می‌خوام", "signals: qty=2").signals.length === 0, "verb in the next clause → rejected");
  ok(qtyAttached("۵ هزار تا لازم دارم", 5000) && qtyAttached("۲۰ کارتن", 20), "scale and unit");
}

// ---------- ۱ و ۲. meta درخواست و تلاش‌ها ----------
{
  const m = readRequestMeta({
    raw: ["a", "b"],
    retry: 1,
    calls: [
      { which: "primary", ms: 25100, error: "timeout" },
      { which: "fallback", ms: 4200, finish: "length", inTok: 900, outTok: 400, reminder: "length" },
    ],
    cleaned: ["x"],
  });
  ok(m.raws.length === 2 && m.retry && m.calls.length === 2 && m.cleaned[0] === "x", "readRequestMeta");
  ok(callLine(m.calls[0]) === "اصلی · ۲۵٫۱ ث · خطا: دیر شد", `call line timeout (${callLine(m.calls[0])})`);
  ok(callLine(m.calls[1]) === "پشتیبان · ۴٫۲ ث · ۹۰۰ → ۴۰۰ توکن · بریده (سقف توکن) · بعد از یادآوری «کوتاه‌تر»", `call line length (${callLine(m.calls[1])})`);
  ok(readRequestMeta(null).raws.length === 0, "empty meta");
}

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
