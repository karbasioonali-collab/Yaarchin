// تست واحد بخش ۴۱: قیمت «فقط کالا + حمل تا مرز» برای دستیار (compactLanded و دستورالعمل) و «پیشنهاد بسته‌بندی از مشخصات».
import { readFileSync } from "node:fs";
import { compactLanded } from "../../src/lib/ai/context-shape.ts";
import { SYSTEM_PROMPT } from "../../src/lib/ai/prompt.ts";
import { suggestPacking } from "../../src/lib/catalog/packing-suggest.ts";
import { packingFromAttributes } from "../../src/lib/import/alibaba/parse.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};

// ---- دستیار: بدون HS
{
  const base = { status: "ready", qty: 5000, moq: 2500, belowMoq: false, ratesDate: "2026-11-01" };
  const border = compactLanded({ ...base, borderOnly: true, methods: [{ key: "sea", nameFa: "دریایی", status: "border", unit: 3510, total: 17550000, days: null }] });
  ok(border.goods_and_shipping_to_iran_border_only === true && /customs/.test(border.excludes), "border-only flag + what is excluded");
  ok(border.methods[0].needsInquiry === false && border.methods[0].unitToman === 3510, "border method has a number, not inquiry");
  const full = compactLanded({ ...base, borderOnly: false, methods: [{ key: "sea", nameFa: "دریایی", status: "ok", unit: 5000, total: 25000000, days: null }] });
  ok(!("goods_and_shipping_to_iran_border_only" in full), "full landed: no border flag");
  const inq = compactLanded({ ...base, borderOnly: false, methods: [{ key: "sea", nameFa: "دریایی", status: "inquiry", unit: null, total: null, days: null }] });
  ok(inq.methods[0].needsInquiry === true, "inquiry stays inquiry");
  ok(SYSTEM_PROMPT.includes("goods_and_shipping_to_iran_border_only") && SYSTEM_PROMPT.includes("never call it the final or full landed cost"), "prompt: border-only rule");
}

// ---- پیشنهاد بسته‌بندی (نمونه‌ی ۳: Single gross weight 0.005 kg، Single package size 9X9X3.1 cm)
const s3 = JSON.parse(readFileSync(new URL("../fixtures/alibaba/sample3.expected.json", import.meta.url), "utf8"));
const empty = { unitWeightKg: null, unitsPerCarton: null, cartonWeightKg: null, cartonLengthCm: null, cartonWidthCm: null, cartonHeightCm: null };
{
  const pa = packingFromAttributes(s3.attributes);
  ok(pa.unitWeightKg === 0.005 && pa.unitDimsCm?.h === 3.1, "packingFromAttributes = parser result");
  const r = suggestPacking([{ label: "کارخانه‌ی ۱", meta: {}, specs: { attributes: s3.attributes } }], empty);
  ok(
    r.suggestions.length === 1 && r.suggestions[0].key === "unitWeightKg" && r.suggestions[0].fields.unitWeightKg === "0.005",
    `unit weight suggested (${JSON.stringify(r.suggestions)})`,
  );
  ok(r.unitDims.length === 1 && r.unitDims[0].text === "9×9×3.1 cm", "unit dims info (no units per carton)");
  // محصول تعداد در کارتن دارد ← تخمین کارتن
  const r2 = suggestPacking([{ label: "کارخانه‌ی ۱", meta: {}, specs: { attributes: s3.attributes } }], { ...empty, unitsPerCarton: 100 });
  const cw = r2.suggestions.find((x) => x.key === "cartonWeightKg");
  const cd = r2.suggestions.find((x) => x.key === "cartonDims");
  ok(cw && cw.fields.cartonWeightKg === "0.5" && cw.estimated, "carton weight estimated = 0.005 × 100");
  ok(cd && cd.estimated && Object.keys(cd.fields).length === 3 && r2.unitDims.length === 0, "carton dims estimated (3 fields)");
  // خانه‌ی پر ← پیشنهادی نیست
  const r3 = suggestPacking([{ label: "x", meta: {}, specs: { attributes: s3.attributes } }], { ...empty, unitWeightKg: 0.01 });
  ok(!r3.suggestions.some((x) => x.key === "unitWeightKg"), "filled field: no suggestion");
  // meta.packing (ورود از علی‌بابا با انتخاب «۲۵ عدد در هر کارتن») اول؛ کارتنِ تخمینیِ meta دوباره تخمین زده می‌شود
  const meta = {
    packing: {
      unitWeightKg: 0.01,
      unitDimsCm: { l: 9, w: 9, h: 3 },
      unitsPerCarton: 25,
      cartonDimsCm: { l: 99, w: 99, h: 99 },
      cartonWeightKg: 0.25,
      estimated: { cartonWeightKg: true, cartonDimsCm: true },
    },
  };
  const r4 = suggestPacking([{ label: "A", meta, specs: {} }], empty);
  ok(r4.suggestions.find((x) => x.key === "unitsPerCarton")?.fields.unitsPerCarton === "25", "units per carton from meta.packing");
  ok(r4.suggestions.find((x) => x.key === "cartonDims")?.fields.cartonLengthCm !== "99", "estimated meta carton not reused as real");
  // دو لیستینگ با همان مقدار ← یک پیشنهاد با دو منبع
  const r5 = suggestPacking(
    [
      { label: "A", meta: {}, specs: { attributes: s3.attributes } },
      { label: "B", meta: {}, specs: { attributes: s3.attributes } },
    ],
    empty,
  );
  ok(r5.suggestions[0].sources.join(",") === "A,B", "same value from two listings → one suggestion, two sources");
  ok(suggestPacking([{ label: "x", meta: null, specs: null }], empty).suggestions.length === 0, "no data → nothing");
}

console.log(`${n} checks${fails ? `, ${fails} FAILED` : ", ALL PASSED"}`);
process.exitCode = fails ? 1 : 0;
