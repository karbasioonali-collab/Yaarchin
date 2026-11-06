// تست واحد بخش ۵۴: زمان رسیدن با دو بخش (آماده‌سازی کارخانه + حمل). محاسبه‌ی آماده‌سازی در computeLanded (چند لیستینگ،
// چند کارخانه، پله‌ی تعداد، عدد قدیمی، حداقل سفارش) و متن مشترک arrivalText در همه‌ی جاها (کارت، جواب‌های کد، داده‌ی مدل).
import { compactLanded } from "../../src/lib/ai/context-shape.ts";
import { buildPriceReply, buildQtyPriceReply, buildTimeReply, TIME_REPLY_END } from "../../src/lib/ai/price-reply.ts";
import { arrivalText, LEAD_MISSING_NOTE, leadMissing } from "../../src/lib/pricing/arrival-text.ts";
import { computeLanded, toPublic } from "../../src/lib/pricing/compute.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};

// ---------- متن ----------
ok(arrivalText(15, { min: 7, max: 12 }) === "حدود ۲۲ تا ۲۷ روز (۱۵ روز آماده‌سازی کارخانه + ۷ تا ۱۲ روز حمل)", "both known");
ok(arrivalText(15, { min: 30, max: 30 }) === "حدود ۴۵ روز (۱۵ روز آماده‌سازی کارخانه + ۳۰ روز حمل)", "single shipping value");
ok(arrivalText(null, { min: 7, max: 12 }) === "۷ تا ۱۲ روز حمل", "preparation unknown → shipping only");
ok(arrivalText(null, { min: 7, max: 12 }, { note: true }) === "۷ تا ۱۲ روز حمل (زمان آماده‌سازی کارخانه ثبت نشده)", "inline note (panel)");
ok(arrivalText(15, null) === "زمان: استعلام" && arrivalText(null, null) === "زمان: استعلام", "no shipping days → inquiry");
ok(
  leadMissing(null, [{ transit: { min: 1, max: 2 } }]) && !leadMissing(5, [{ transit: { min: 1, max: 2 } }]) && !leadMissing(null, [{ transit: null }]),
  "one-time note only when needed",
);
ok(LEAD_MISSING_NOTE === "زمان آماده‌سازی کارخانه ثبت نشده و به این روزها اضافه می‌شود.", "note text");

// ---------- محاسبه ----------
const ship = (key, nameFa, sortOrder, tmin, tmax) => ({
  versionId: 1,
  key,
  nameFa,
  sortOrder,
  isActive: true,
  ratePerKg: 1,
  ratePerCbm: null,
  volumetricFactor: null,
  minCharge: null,
  currency: "USD",
  transitMinDays: tmin,
  transitMaxDays: tmax,
});
const snap = {
  takenAt: "2026-11-06T08:00:00Z",
  today: "2026-11-06",
  currencies: { IRT: { nameFa: "تومان", isBase: true }, USD: { nameFa: "دلار", isBase: false } },
  market: { USD: { id: 1, rate: 100000, date: "2026-11-06" } },
  customs: {},
  shipping: [ship("air", "هوایی", 1, 7, 12), ship("sea", "دریایی", 2, 30, null), ship("rail", "ریلی", 3, null, null)],
  costs: [],
  tax: null,
  hs: {},
};
const packing = { unitWeightKg: 0.5, cartonLengthCm: 50, cartonWidthCm: 40, cartonHeightCm: 30, cartonWeightKg: 10, unitsPerCarton: 20 };
const price = (min) => [{ currency: "USD", observedAt: "2026-11-01T00:00:00Z", tiers: [{ minQty: min, maxQty: null, priceMin: 2, priceMax: 2 }] }];
const L = (companyId, moq, leadTiers, leadDaysLegacy = null) => ({ companyId, moq, prices: price(moq ?? 1), leadTiers, leadDaysLegacy });
const run = (qty, listings) => computeLanded({ productId: "p", qty, priceUnit: "piece", hsCode: null, packing, listings }, snap);
const tiers = [
  { minQty: 100, maxQty: 499, days: 10 },
  { minQty: 500, maxQty: 999, days: 15 },
  { minQty: 2000, maxQty: null, days: 25 },
];

// یک کارخانه، پله‌ی متناسب با تعداد
let r = run(600, [L("A", 100, tiers)]);
ok(r.leadDays === 15, `tier covering 600 → 15 (${r.leadDays})`);
const air = r.methods.find((m) => m.key === "air");
ok(JSON.stringify(air.transit) === '{"min":7,"max":12}' && JSON.stringify(air.days) === '{"min":22,"max":27}', "air: 15 + 7..12 = 22..27");
ok(JSON.stringify(r.methods.find((m) => m.key === "sea").transit) === '{"min":30,"max":30}', "max missing → same as min");
ok(r.methods.find((m) => m.key === "rail").transit === null && r.methods.find((m) => m.key === "rail").days === null, "no shipping days → null");
ok(run(1500, [L("A", 100, tiers)]).leadDays === 15, "between two tiers (1,000..1,999 not recorded) → lower tier");
ok(run(50, [L("A", null, tiers)]).leadDays === 10, "below the first tier → first tier");
ok(run(3000, [L("A", 100, tiers)]).leadDays === 25, "open-ended last tier");
ok(run(600, [L("A", 100, null, 18)]).leadDays === 18, "no tiers → legacy lead_time_days");
// دو کارخانه: هر کارخانه یک رأی (میانگین لیستینگ‌های خودش)، بعد میانگین، رو به بالا
r = run(600, [L("A", 100, [{ minQty: 1, maxQty: null, days: 10 }]), L("A", 100, [{ minQty: 1, maxQty: null, days: 20 }]), L("B", 100, [{ minQty: 1, maxQty: null, days: 12 }])]);
ok(r.leadDays === 14, `A = (10+20)/2 = 15, B = 12 → ceil(13.5) = 14 (${r.leadDays})`);
// فقط لیستینگ‌هایی که در قیمت حساب شدند (حداقل سفارش ≤ تعداد)
r = run(600, [L("A", 100, [{ minQty: 1, maxQty: null, days: 10 }]), L("B", 1000, [{ minQty: 1, maxQty: null, days: 40 }])]);
ok(r.leadDays === 10, `factory with MOQ 1,000 skipped for 600 (${r.leadDays})`);
r = run(50, [L("A", 100, [{ minQty: 1, maxQty: null, days: 10 }]), L("B", 1000, [{ minQty: 1, maxQty: null, days: 40 }])]);
ok(r.leadDays === 25 && r.belowMoq, `nobody accepts → all factories (${r.leadDays})`);
// آماده‌سازی ثبت نشده: زمان حمل می‌ماند (قبلاً کل زمان «استعلام» می‌شد)
r = run(600, [L("A", 100, null, null)]);
const pub = toPublic(r);
ok(
  r.leadDays === null && pub.leadDays === null && JSON.stringify(pub.methods[0].transit) === '{"min":7,"max":12}' && pub.methods[0].days === null,
  "preparation unknown → transit kept, total null",
);

// ---------- جاهای نمایش ----------
const pubFull = toPublic(run(600, [L("A", 100, tiers)]));
ok(pubFull.leadDays === 15 && pubFull.methods.every((m) => "transit" in m), "public result has leadDays + transit");
const qtyReply = buildQtyPriceReply({ title: "تست", unit: "piece", landed: { status: "ready", ...pubFull } }, 600);
ok(qtyReply.includes("حدود ۲۲ تا ۲۷ روز (۱۵ روز آماده‌سازی کارخانه + ۷ تا ۱۲ روز حمل)"), "qty price reply: two parts");
const timeReply = buildTimeReply({ title: "تست", landed: { status: "ready", ...pub } });
ok(
  timeReply === `زمان تقریبی رسیدن تست به ایران:\n- هوایی: ۷ تا ۱۲ روز حمل\n- دریایی: ۳۰ روز حمل\n${LEAD_MISSING_NOTE}\n${TIME_REPLY_END}`,
  `time reply without preparation (${timeReply})`,
);
const priceReply = buildPriceReply({
  title: "تست",
  unit: "piece",
  price: { avg: 2, refQty: 600, moqFrom: 100, tierMin: 2, tierMax: 2 },
  toman: null,
  landed: { status: "ready", ...pub },
});
ok(priceReply.includes("روز حمل") && priceReply.includes(LEAD_MISSING_NOTE), "price reply: shipping only + note");
const c = compactLanded({ status: "ready", ...pubFull });
const ca = c.methods.find((m) => m.method === "هوایی");
ok(
  JSON.stringify(ca.total_days) === '{"min":22,"max":27}' && ca.factory_preparation_days === 15 && JSON.stringify(ca.shipping_days) === '{"min":7,"max":12}' && !("days" in ca),
  "model data: total, factory preparation, shipping",
);
const c2 = compactLanded({ status: "ready", ...pub });
ok(c2.methods[0].total_days === null && c2.methods[0].factory_preparation_days === null && c2.methods[0].shipping_days.min === 7, "model data without preparation");

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
