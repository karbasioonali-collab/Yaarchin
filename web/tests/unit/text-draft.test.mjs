// تست واحد «متن فارسی محصول با AI» (src/lib/catalog/text-draft-core.ts). docs/infoyaarchin.md بخش ۴۰.
import { readFileSync } from "node:fs";
import { buildDraftInput, checkDraft, draftUserMessage, estimateTokens, fakeDraft, numbersIn, parseDraft, scrub } from "../../src/lib/catalog/text-draft-core.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};
const Z = "‌";
const fx = (i) => JSON.parse(readFileSync(new URL(`../fixtures/alibaba/sample${i}.expected.json`, import.meta.url), "utf8"));
const listing = (e) => ({ titleEn: e.title, specs: { attributes: e.attributes, highlights: e.highlights } });
const BL = ["Sample Supplier A Technology Co., Ltd.", "Sample Supplier A", "supplier-a", "BrandB"];

// ---- ورودی
const input = buildDraftInput([listing(fx(1)), listing(fx(2)), listing(fx(3))], BL);
{
  const msg = draftUserMessage(input);
  ok(input.titles.length === 3 && input.highlights.length === 10, `titles 3, real highlights 5+0+5 (${input.titles.length}, ${input.highlights.length})`);
  ok(!/Brand Name|Place of Origin|Model Number|Guangdong|Anhui|BrandB|MODEL-B01/i.test(msg), "no supplier attributes (brand, origin, model) in AI input");
  ok(!/Sample Supplier|supplier-a/i.test(msg), "no supplier names or ids");
  ok(
    input.localSpecs.some((s) => s.labelFa === "شکل" && s.valueFa === "گرد"),
    "dictionary-translated specs kept local (شکل: گرد)",
  );
  ok(!input.specs.some((s) => /^shape$/i.test(s.name)), "dictionary rows not sent to AI");
  ok(input.specs.length > 0 && input.specs.length <= 40, `some specs sent for translation (${input.specs.length})`);
  ok(!msg.includes("Resin Ashtray Customized Shape For Rooftop"), "promo phrases not in input (only real highlights)");
  ok(scrub("Made by Sample Supplier A for you", ["Sample Supplier A"]) === "Made by for you", "scrub supplier name from text");
  const e = estimateTokens(input);
  ok(e.prompt > 100 && e.completion > 500, `token estimate (${e.prompt}+${e.completion})`);
}

// ---- خروجی: قالب و یکسان‌سازی
{
  const raw =
    'متن قبل ```json\n{"titleFa":"زیرسیگاری يکبار مصرف","summaryFa":"بوی سیگار را کم می کند .","descriptionFa":"• ژل خاموش کننده","specs":[{"name":"Type","labelFa":"نوع","valueFa":"رومیزی","unit":""},{"labelFa":"","valueFa":"x"}]}\n```';
  const o = parseDraft(raw);
  ok(o && o.titleFa === "زیرسیگاری یکبار مصرف", "parse + ي→ی");
  ok(o.summaryFa === `بوی سیگار را کم می${Z}کند.`, `normalize: می‌کند, no space before dot (${o.summaryFa})`);
  ok(o.specs.length === 1 && o.specs[0].labelFa === "نوع", "empty spec rows dropped");
  ok(parseDraft("not json") === null && parseDraft("{}") === null, "bad/empty JSON → null");
}

// ---- محافظ
{
  const base = {
    titleFa: "زیرسیگاری یکبار مصرف",
    summaryFa: "خاموش کردن سریع سیگار",
    descriptionFa: "• ژل خاموش‌کننده",
    specs: [{ labelFa: "اندازه", valueFa: "9×9×3.1", unit: "سانتی‌متر" }],
  };
  ok(checkDraft(base, input, BL).length === 0, "clean draft passes (numbers from data)");
  const t = (patch, type, m) => {
    const hits = checkDraft({ ...base, ...patch }, input, BL);
    ok(
      hits.some((h) => h.type === type),
      `${m} → ${type} (${JSON.stringify(hits)})`,
    );
  };
  t({ descriptionFa: "ساخت Sample Supplier A" }, "blacklist", "supplier name");
  t({ summaryFa: "فقط ۰٫۰۲ دلار" }, "price", "price/currency");
  t({ summaryFa: "قیمت مناسب" }, "price", "word قیمت");
  t({ descriptionFa: "ساخت گوانگدونگ" }, "place", "Chinese province (fa)");
  t({ descriptionFa: "Made in Shenzhen" }, "place", "Chinese city (en)");
  t({ descriptionFa: "مناسب ۵۰۰ نفر" }, "number", "invented number (Persian digits)");
  t({ specs: [{ labelFa: "وزن", valueFa: "12", unit: "گرم" }] }, "number", "invented number in spec");
  t({ descriptionFa: "www.example.com" }, "url", "url");
  t({ descriptionFa: "از علی‌بابا" }, "shop_site", "shop site");
  ok(numbersIn("۲٬۵۰۰ و 3.10 و ۰٫۵").join(",") === "2500,3.1,0.5", "numbersIn: thousand separators, decimals, Persian digits");
}

// ---- حالت آزمایشی
{
  const f = fakeDraft(input);
  ok(!f.titleFa && !f.descriptionFa && f.specs.length === input.localSpecs.length, "fake: only dictionary specs");
}

console.log(`${n} checks${fails ? `, ${fails} FAILED` : ", ALL PASSED"}`);
process.exitCode = fails ? 1 : 0;
