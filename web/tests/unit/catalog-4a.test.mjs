// تست واحد PR ۴الف (docs/infoyaarchin.md بخش ۳۸): قیمت «تعداد مرجع»، گرد کردن نمایش، مشخصات ترکیبی و واژه‌نامه،
// آیکون خودکار دسته و تشخیص مرورگر قدیمی.
import { readFileSync } from "node:fs";
import { defaultReferenceQty, listingMoq, referencePrice } from "../../src/lib/pricing/reference.ts";
import { pickTier, round10, round1000 } from "../../src/lib/pricing/tiers.ts";
import { fmtUsd } from "../../src/lib/format.ts";
import { mergeSpecs } from "../../src/lib/import/merge-specs.ts";
import { isSupplierAttr, translateSpec } from "../../src/lib/import/dictionary.ts";
import { CATEGORY_ICONS, pickCategoryIcon } from "../../src/lib/catalog/category-icons.ts";
import { oldBrowser } from "../../src/lib/old-browser.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

// ---- زیرسیگاری: سه نمونه روی یک محصول (فروشنده A: ۱ و ۲؛ B: ۳)، همان عددهای جدول قبل/بعد
const fx = (i) => JSON.parse(readFileSync(new URL(`../fixtures/alibaba/sample${i}.expected.json`, import.meta.url), "utf8"));
const L = (id, co, e) => ({
  listingId: id,
  companyId: co,
  moq: e.moq,
  tiers: e.priceTiers.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty, priceMin: t.price, priceMax: t.priceMax })),
});
const ash = [L("l1", "A", fx(1)), L("l2", "A", fx(2)), L("l3", "B", fx(3))];
{
  ok(listingMoq(ash[0]) === 30000 && listingMoq(ash[2]) === 2500, "listing MOQ = max(moq, first tier)");
  ok(defaultReferenceQty(ash) === 5000, "default ref qty = upper median of MOQs (2500, 5000, 30000 → 5000)");
  const r = referencePrice(ash);
  ok(r.qty === 5000 && r.qtySource === "default", "ref qty 5000 (default)");
  ok(near(r.avg, 0.035), `avg at 5000 = (A 0.05 + B 0.02) / 2 = 0.035 (${r.avg})`);
  ok(r.min === 0.02 && r.max === 0.05 && r.suppliers === 2, "range 0.02–0.05, 2 suppliers");
  ok(r.excluded.length === 1 && r.excluded[0].listingId === "l1" && r.excluded[0].moq === 30000, "sample1 (MOQ 30000) excluded");
  const m = referencePrice(ash, 30000);
  ok(m.qty === 30000 && m.qtySource === "manual" && near(m.avg, 0.03) && m.excluded.length === 0, `manual 30000: all accept, A=(0.04+0.04)/2, B=0.02 → 0.03 (${m.avg})`);
  const low = referencePrice(ash, 10);
  ok(low.qty === 2500 && low.used.length === 1, "manual below every MOQ → raised to smallest MOQ (always ≥1 supplier)");
  ok(referencePrice([]) === null && referencePrice([{ listingId: "x", companyId: "c", moq: 5, tiers: [] }]) === null, "no prices → null");
  // میانه‌ی بالایی با تعداد زوج
  ok(defaultReferenceQty([L("a", "A", fx(2)), L("b", "B", fx(3))]) === 5000, "even count → upper middle");
  // پله‌ی بین دو پله (فاصله‌ی ثبت‌نشده) ← پله‌ی پایین‌تر؛ وسط بازه‌ی پله
  const gap = [
    {
      listingId: "g",
      companyId: "G",
      moq: 100,
      tiers: [
        { minQty: 100, maxQty: 199, priceMin: 2, priceMax: 4 },
        { minQty: 500, maxQty: null, priceMin: 1, priceMax: null },
      ],
    },
  ];
  ok(referencePrice(gap, 300).avg === 3, "qty between tiers → lower tier, mid of its range");
  ok(pickTier(gap[0].tiers, 50).below === true, "pickTier below first tier");
  // هر کارخانه یک رأی
  const votes = [
    { listingId: "1", companyId: "A", moq: 1, tiers: [{ minQty: 1, maxQty: null, priceMin: 1, priceMax: null }] },
    { listingId: "2", companyId: "A", moq: 1, tiers: [{ minQty: 1, maxQty: null, priceMin: 3, priceMax: null }] },
    { listingId: "3", companyId: "B", moq: 1, tiers: [{ minQty: 1, maxQty: null, priceMin: 10, priceMax: null }] },
  ];
  ok(referencePrice(votes, 1).avg === 6, "one vote per company: A=(1+3)/2=2, B=10 → 6");
}

// ---- گرد کردن فقط در نمایش
{
  ok(fmtUsd(0.035) === "۰٫۰۳۵" && fmtUsd(0.02625) === "۰٫۰۲۶" && fmtUsd(0.5) === "۰٫۵۰", `USD < 1: up to 3 decimals (${fmtUsd(0.035)}, ${fmtUsd(0.02625)}, ${fmtUsd(0.5)})`);
  ok(fmtUsd(12.3) === "۱۲٫۳۰" && fmtUsd(8.616) === "۸٫۶۲", "USD ≥ 1: 2 decimals");
  ok(round10(146630.4) === 146630 && round10(3504) === 3500 && round10(3) === 10, "unit toman → nearest 10 (min 10)");
  ok(round1000(73315230) === 73315000 && round1000(200) === 1000, "total → nearest 1000 (min 1000)");
}

// ---- مشخصات ترکیبی و واژه‌نامه
{
  const m = mergeSpecs([
    { listingId: "1", attributes: fx(1).attributes },
    { listingId: "2", attributes: fx(2).attributes },
    { listingId: "3", attributes: fx(3).attributes },
  ]);
  const row = (name) => m.find((r) => r.key === name.toLowerCase());
  ok(m.length > 10, `merged rows (${m.length})`);
  ok(m.filter((r) => r.supplierInfo).every((r) => !/^(material|color|size)$/i.test(r.name)) && m.some((r) => r.supplierInfo), "supplier rows flagged (brand, origin, model)");
  ok(m[0].common || m.every((r) => !r.common), "common rows first");
  const po = row("Place of Origin");
  ok(!po || po.supplierInfo, "Place of Origin = supplier info");
  ok(isSupplierAttr("Brand Name") && isSupplierAttr("model number") && !isSupplierAttr("Material"), "isSupplierAttr");
  const t = translateSpec("Material", "Paper");
  ok(t.labelFa === "جنس" && t.valueFa === "کاغذ" && t.translated.label && t.translated.value, "dictionary: Material: Paper → جنس: کاغذ");
  const d = translateSpec("Size", "9*9*3.1cm");
  ok(d.labelFa === "اندازه" && d.valueFa === "9×9×3.1" && d.unit === "سانتی‌متر", `dictionary: size with unit (${JSON.stringify(d)})`);
  const u = translateSpec("Shape", "Hexagon Star");
  ok(u.labelFa === "شکل" && u.valueFa === "Hexagon Star" && !u.translated.value, "unknown value stays English (for human/AI)");
  ok(translateSpec("Color", "Black, White").valueFa === "مشکی، سفید", "list of known values");
  const one = mergeSpecs([{ listingId: "1", attributes: [{ name: "Material", value: "Paper" }] }]);
  ok(one[0].common, "single listing: rows count as common");
  const diff = mergeSpecs([
    { listingId: "1", attributes: [{ name: "Color", value: "Black" }] },
    { listingId: "2", attributes: [{ name: "color", value: "White" }] },
  ]);
  ok(!diff[0].common && diff[0].values.join("|") === "Black|White" && diff[0].suggestion.valueFa === "مشکی، سفید", "different values: side by side, joined suggestion");
}

// ---- آیکون خودکار دسته
{
  ok(
    CATEGORY_ICONS.some((i) => i.key === "general"),
    "generic icon in list",
  );
  ok(pickCategoryIcon({ nameFa: "زیرسیگاری", nameEn: "Ashtrays" }) === "home-decor", "ashtray → home-decor");
  ok(pickCategoryIcon({ nameFa: "خانه و آشپزخانه" }) === "kitchenware", "خانه و آشپزخانه → kitchenware");
  ok(pickCategoryIcon({ nameFa: "لامپ و چراغ", nameEn: "LED Bulbs" }) === "lighting", "lighting");
  ok(pickCategoryIcon({ nameFa: "کیسه کاغذی", nameEn: "Paper Bags" }) === "packaging", "paper bags → packaging");
  ok(pickCategoryIcon({ nameFa: "چیز ناشناس", nameEn: "Qwerty" }) === "general", "no match → general");
  ok(pickCategoryIcon({ nameFa: "چیز ناشناس", parentImage: "/media/icons/categories/toys.svg" }) === "toys", "no match → parent's icon");
  ok(pickCategoryIcon({ nameFa: "ناشناس", path: ["Home & Garden", "Lighters & Smoking Accessories", "Ashtrays"] }) === "home-decor", "Alibaba path used");
}

// ---- مرورگر قدیمی
{
  const c109w7 = "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36";
  const b = oldBrowser(c109w7);
  ok(b && b.name === "Chrome" && b.version === 109 && b.win7, "Chrome 109 on Windows 7 → old, win7");
  ok(oldBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36") === null, "Chrome 131 → ok");
  ok(oldBrowser("Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0") === null, "Firefox ESR 115 on Win7 → ok");
  ok(oldBrowser("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0 Safari/537.36 Edg/108.0.1462.54")?.name === "Edge", "Edge 108 → old");
  ok(oldBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15")?.name === "Safari", "Safari 15.6 → old");
  ok(
    oldBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1") === null,
    "Safari 17 → ok",
  );
  ok(oldBrowser("") === null && oldBrowser(null) === null && oldBrowser("curl/8.0") === null, "unknown UA → no banner");
}

console.log(`${n} checks${fails ? `, ${fails} FAILED` : ", ALL PASSED"}`);
process.exitCode = fails ? 1 : 0;
