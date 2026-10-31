// تست واحد خواننده‌ی صفحه‌ی علی‌بابا (src/lib/import/alibaba). docs/infoyaarchin.md بخش ۳۵.
// نمونه‌ها: tests/fixtures/alibaba/sampleN.{html,resources.json,expected.json} (ناشناس‌شده با make-fixture.mjs).
// نمونه‌ی تازه = یک دستور make-fixture و بازبینی expected.json؛ این تست همه‌ی sample*.html پوشه را خودش پیدا می‌کند.
import { readdirSync, readFileSync } from "node:fs";
import { decodeQuotedPrintable, MhtmlError, parseMhtml } from "../../src/lib/import/alibaba/mhtml.ts";
import { originalImageUrl, parseAlibabaProduct, PARSER_VERSION } from "../../src/lib/import/alibaba/parse.ts";
import { estimateCarton, normUnit, parseDims, parsePerCarton, parsePrice, parseQtyRange, parseWeight } from "../../src/lib/import/alibaba/values.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- نمونه‌ها: خروجی کامل = expected.json
const FX = new URL("../fixtures/alibaba/", import.meta.url);
const load = (name) => {
  const html = readFileSync(new URL(`${name}.html`, FX), "utf8");
  const { url, resources } = JSON.parse(readFileSync(new URL(`${name}.resources.json`, FX), "utf8"));
  const lookup = (u) => (resources[u] ? { type: resources[u][0], size: resources[u][1] } : null);
  return { html, url, lookup, expected: JSON.parse(readFileSync(new URL(`${name}.expected.json`, FX), "utf8")) };
};
const samples = readdirSync(FX)
  .filter((f) => /^sample.*\.html$/.test(f))
  .map((f) => f.replace(/\.html$/, ""));
ok(samples.length >= 3, `fixtures found (${samples.length})`);
const R = {};
for (const s of samples) {
  const { html, url, lookup, expected } = load(s);
  const r = parseAlibabaProduct(html, { url, lookup });
  R[s] = r;
  ok(eq(r, expected), `${s}: output equals expected.json (re-run make-fixture with --update only after checking the diff)`);
  ok(r.parserVersion === PARSER_VERSION, `${s}: parser version`);
  ok(fieldsMissing(r).length <= 6, `${s}: few missing fields (${fieldsMissing(r).join(", ")})`);
}
function fieldsMissing(r) {
  return Object.entries(r.fields)
    .filter(([, v]) => v === "missing")
    .map(([k]) => k);
}

// ---- مقدارهای مشخص (همان گزارش بررسی؛ اگر expected.json عوض شد این‌ها جلوی خطای بی‌صدا را می‌گیرند)
{
  const a = R.sample1;
  ok(a.title === "Wholesale Disposable Portable Smokeless Ashtray With Gel", "s1 title");
  ok(a.currency === "USD" && a.unit === "piece" && a.moq === 30000, "s1 currency/unit/moq");
  ok(
    eq(a.priceTiers, [
      { minQty: 30000, maxQty: 599999, price: 0.04, priceMax: null },
      { minQty: 600000, maxQty: 999999, price: 0.03, priceMax: null },
      { minQty: 1000000, maxQty: null, price: 0.02, priceMax: null },
    ]),
    "s1 price tiers (recommendation cards ignored)",
  );
  ok(
    eq(a.leadTimes, [
      { minQty: 1, maxQty: 30000, days: 10 },
      { minQty: 30001, maxQty: 600000, days: 15 },
      { minQty: 600001, maxQty: 1000000, days: 20 },
    ]),
    "s1 lead times («To be negotiated» skipped)",
  );
  ok(eq(a.customization, [{ name: "Color", moq: 20000 }]), "s1 customization with MOQ");
  ok(eq(a.options, [{ name: "Color", values: ["White"], customizable: false }]), "s1 options");
  ok(a.attributes.length === 18 && a.attributes.filter((x) => x.name === "Material").length === 2, "s1 attributes (repeated names kept)");
  ok(a.placeOfOrigin === "Guangdong, China", "s1 place of origin");
  ok(a.images.length === 6 && a.images.every((i) => i.embedded && i.type === "image/avif") && a.galleryCount === 7 && a.hasVideo, "s1 gallery: 6 embedded AVIF + video");
  ok(a.descriptionImages.length === 11 && a.descriptionImages.every((i) => i.embedded), "s1 description images (supplier photos excluded)");
  ok(a.highlights.length === 20, "s1 highlights");
  ok(a.warnings.some((w) => w.includes("Quantity: 25 pieces")) && a.packing.unitsPerCarton === null, "s1 ambiguous «Quantity» → warning, not units per carton");
  const s = a.supplier;
  ok(s.name === "Sample Supplier A Technology Co., Ltd." && s.type === "trading" && s.typeRaw === "Trading Company", "s1 supplier name/type");
  ok(s.country === "CN" && s.years === 1 && s.rating === 5 && s.topBuyers === 13 && s.avgDispatchDays === 6, "s1 supplier metrics");
  ok(s.revenue === "$5K — $10K" && s.responseTime === "≤2h" && s.onTimeRate === "77.8%", "s1 supplier text metrics");
  ok(
    s.storeId === "supplier-a" && s.storeUrl === "https://supplier-a.en.alibaba.com/" && s.profileUrl === "https://supplier-a.en.alibaba.com/company_profile.html",
    "s1 supplier links",
  );
  ok(!!s.about && s.about.includes("Sample Supplier A") && !/Know your supplier/.test(s.about), "s1 supplier about (internal)");
  ok(/^https:\/\/www\.alibaba\.com\/product-detail\/.+_\d{13}\.html$/.test(a.productUrl) && a.productUrl.endsWith(`_${a.productId}.html`), "s1 product url (no query) + id");
  ok(eq(a.categoryPath, ["Home & Garden", "Lighters & Smoking Accessories", "Ashtrays"]), "s1 category path");

  const b = R.sample2;
  ok(b.supplier.storeId === a.supplier.storeId && b.productId !== a.productId, "s1 and s2: same supplier, different listings");
  ok(b.moq === 5000 && b.priceTiers.length === 3 && b.priceTiers[0].price === 0.05, "s2 tiers");

  const c = R.sample3;
  ok(eq(c.priceTiers, [{ minQty: 2500, maxQty: null, price: 0.02, priceMax: null }]) && c.moq === 2500, "s3 single price + «Minimum order quantity»");
  ok(eq(c.packing.unitDimsCm, { l: 9, w: 9, h: 3.1 }) && c.packing.unitWeightKg === 0.005, "s3 single package size + gross weight");
  ok(c.packing.cartonWeightKg === null && c.fields.cartonWeight === "missing", "s3: no carton → no estimate (units per carton unknown)");
  ok(eq(c.options[0], { name: "Color", values: ["White"], customizable: true }), "s3 «White customizable»");
  ok(c.customization.length === 0 && c.fields.customization === "missing", "s3 no customization block");
  ok(eq(c.leadTimes, [{ minQty: 1, maxQty: 2500, days: 31 }]), "s3 lead time");
  ok(c.descriptionImages.length === 12 && c.descriptionImages.filter((i) => i.embedded).length === 5, "s3: 7 description images not embedded");
  ok(
    c.warnings.some((w) => w.includes("اسکرول")),
    "s3: scroll warning",
  );
  ok(c.supplier.storeId === "supplier-b" && c.supplier.rating === 4.3 && c.supplier.years === 1, "s3 supplier");
}

// ---- HTML زنده‌ی اکستنشن (با <script>) همان خروجی را می‌دهد
{
  const { html, url, lookup } = load("sample1");
  const live = html.replace("<body", '<script>window.detailData={"price":"$9.99","moq":1}</script><body');
  ok(eq(parseAlibabaProduct(live, { url, lookup }).priceTiers, R.sample1.priceTiers), "scripts in live HTML are ignored");
  const noLookup = parseAlibabaProduct(html, { url });
  ok(
    noLookup.images.every((i) => !i.embedded) && !noLookup.warnings.some((w) => w.includes("اسکرول")),
    "without a resource lookup (extension) images are links only, no scroll warning",
  );
}

// ---- صفحه‌ی ساختگی: تله‌ی پیشنهادی، ارز ناشناخته، تخمین کارتن
const page = (price, attrs = [], extra = "") => `<html><head><meta property="og:title" content="Test Item - Buy Test Item Product on Alibaba.com"></head><body>
  <div data-testid="other-recommendation-product-card"><div data-module-name="module_price"><div data-testid="pc-purchase-price-tier"><div data-testid="pc-purchase-price-tier-prices"><strong data-testid="pc-purchase-price-tier-current">$9.99</strong></div><div>1-9 pieces</div></div></div></div>
  ${extra}
  ${price}
  ${attrs.map(([k, v]) => `<div data-testid="module-attribute-row"><div data-testid="module-attribute-name">${k}</div><div data-testid="module-attribute-value">${v}</div></div>`).join("")}
  </body></html>`;
const tier = (p, q) =>
  `<div data-testid="pc-purchase-price-tier"><div data-testid="pc-purchase-price-tier-prices"><strong data-testid="pc-purchase-price-tier-current">${p}</strong></div><div>${q}</div></div>`;
{
  // کارت پیشنهادی (با قیمت ۹٫۹۹) قبل از قیمت اصلی آمده؛ قیمت فقط از قیمت اصلی خوانده می‌شود
  const main = parseAlibabaProduct(page(`<div data-module-name="module_price">${tier("$0.50", "100-499 pieces")}</div>`));
  ok(main.title === "Test Item", "og:title fallback without «- Buy … on Alibaba.com»");
  ok(eq(main.priceTiers, [{ minQty: 100, maxQty: 499, price: 0.5, priceMax: null }]), "price only from the main block, not the recommendation card before it");
  const onlyCard = parseAlibabaProduct(page(""));
  ok(onlyCard.priceTiers.length === 0 && onlyCard.warnings.some((w) => w.includes("module_price")), "recommendation card alone → no price");
  const p = parseAlibabaProduct(
    page(`<div data-module-name="module_price">${tier("€1.20", "100-499 pieces")}</div>`).replace(
      /<div data-testid="other-recommendation-product-card">.*?<\/div><\/div><\/div><\/div>/s,
      "",
    ),
  );
  ok(p.priceTiers.length === 0 && p.currency === null && p.warnings.some((w) => w.includes("€")), "unknown currency → no prices + warning");
  const y = parseAlibabaProduct(`<div data-module-name="module_price">${tier("¥3.50", "1,000-4,999 sets")}${tier("¥3.00", "≥5,000 sets")}</div>`);
  ok(y.currency === "CNY" && y.unit === "set" && y.moq === 1000 && y.priceTiers[1].minQty === 5000, "CNY + sets");
  const r = parseAlibabaProduct(`<div data-module-name="module_price">${tier("$1.20 - 1.50", "2-99 bags")}</div>`);
  ok(r.priceTiers[0].price === 1.2 && r.priceTiers[0].priceMax === 1.5 && r.unit === "bags" && r.warnings.some((w) => w.includes("bags")), "price range + unknown unit warning");
  const none = parseAlibabaProduct("<html><body><h1>x</h1></body></html>");
  ok(none.priceTiers.length === 0 && none.warnings.some((w) => w.includes("module_price")), "no price module → layout-changed warning");

  const est = parseAlibabaProduct(
    page("", [
      ["Single gross weight", "200 g"],
      ["Single package size", "10x10x5 cm"],
      ["Packing", "50 pcs/carton"],
    ]),
  );
  ok(est.packing.unitWeightKg === 0.2 && est.packing.unitsPerCarton === 50, "unit weight (g → kg) + units per carton");
  ok(est.packing.cartonWeightKg === 10 && est.packing.estimated.cartonWeightKg && est.fields.cartonWeight === "estimated", "carton weight estimated = unit × count");
  ok(eq(est.packing.cartonDimsCm, { l: 30.2, w: 30.2, h: 30.2 }) && est.fields.cartonDims === "estimated", "carton dims estimated: cube of volume × 1.1");
  const given = parseAlibabaProduct(
    page("", [
      ["Single gross weight", "0.2 kg"],
      ["Carton size", "40*30*20cm"],
      ["Carton gross weight", "11 kg"],
      ["Qty per carton", "50"],
    ]),
  );
  ok(
    eq(given.packing.cartonDimsCm, { l: 40, w: 30, h: 20 }) &&
      given.packing.cartonWeightKg === 11 &&
      given.packing.unitsPerCarton === 50 &&
      given.fields.cartonDims === "found" &&
      !given.packing.estimated.cartonWeightKg,
    "carton values from the page are used as found, not estimated",
  );
}

// ---- تبدیل متن‌ها
ok(eq(parsePrice("$0.04"), { currency: "USD", symbol: "$", min: 0.04, max: null }), "price $");
ok(parsePrice("US $1,234.50")?.min === 1234.5 && parsePrice("CN¥2")?.currency === "CNY" && parsePrice("RMB 3")?.currency === "CNY", "price variants");
ok(parsePrice("$2 - 1")?.max === null, "price range max must exceed min");
ok(eq(parseQtyRange("30,000-599,999 pieces"), { min: 30000, max: 599999, unit: "pieces" }), "qty range");
ok(eq(parseQtyRange("≥1,000,000 pieces"), { min: 1000000, max: null, unit: "pieces" }), "qty ≥");
ok(eq(parseQtyRange(" > 1,000,000 "), { min: 1000001, max: null, unit: null }), "qty > (exclusive)");
ok(eq(parseQtyRange("1 - 2,500"), { min: 1, max: 2500, unit: null }), "qty with spaces");
ok(eq(parseQtyRange("Minimum order quantity: 2,500 pieces"), { min: 2500, max: null, unit: "pieces" }), "qty after label");
ok(parseQtyRange("To be negotiated") === null, "negotiated → null");
ok(eq(parseDims("9X9X3.1 cm"), { l: 9, w: 9, h: 3.1 }) && eq(parseDims("200*150*100mm"), { l: 20, w: 15, h: 10 }), "dims cm/mm");
ok(parseDims("about 10cm") === null, "dims need 3 numbers");
ok(parseWeight("0.005 kg") === 0.005 && parseWeight("150g") === 0.15 && parseWeight("2 lbs") === 0.9072 && parseWeight("heavy") === null, "weights");
ok(parsePerCarton("100 pcs/carton") === 100 && parsePerCarton("50 pieces per carton") === 50 && parsePerCarton("Ln Boxes or Cases(Customized)") === null, "per carton");
ok(normUnit("Pieces").unit === "piece" && normUnit("sets").known && !normUnit("bags").known, "units");
ok(
  eq(estimateCarton({ unitWeightKg: null, unitDimsCm: null, unitsPerCarton: 10, cartonDimsCm: null, cartonWeightKg: null }).estimated, {
    cartonWeightKg: false,
    cartonDimsCm: false,
  }),
  "no unit data → no estimate",
);
ok(originalImageUrl("//s.alicdn.com/@sc04/kf/Habc.jpg_960x960q80.jpg") === "https://s.alicdn.com/@sc04/kf/Habc.jpg", "original image url");

// ---- MHTML ساختگی: quoted-printable (UTF-8 و شکستن نرم)، base64، CSS دست‌نخورده
{
  const B = "----MultipartBoundary--abc----";
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const qp = '<html><body><h1 class=3D"t">Caf=C3=A9 =D8=B3=D9=84=D8=A7=D9=85 lo=\r\nng</h1></body></html>';
  const file = [
    `From: <Saved by Blink>\r\nSnapshot-Content-Location: https://www.alibaba.com/product-detail/X_1234567890123.html?spm=1\r\nSubject: Test\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n\ttype="text/html";\r\n\tboundary="${B}"\r\n\r\n`,
    `--${B}\r\nContent-Type: text/html\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Location: https://www.alibaba.com/x\r\n\r\n${qp}\r\n`,
    `--${B}\r\nContent-Type: text/css\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Location: cid:css-1@mhtml.blink\r\n\r\nbody{color:red}\r\n`,
    `--${B}\r\nContent-Type: image/png\r\nContent-Transfer-Encoding: base64\r\nContent-Location: https://s.alicdn.com/kf/Hx.png\r\n\r\n${png.toString("base64").replace(/(.{8})/g, "$1\r\n")}\r\n`,
    `--${B}--\r\n`,
  ].join("");
  const m = parseMhtml(Buffer.from(file, "latin1"));
  ok(m.url === "https://www.alibaba.com/product-detail/X_1234567890123.html?spm=1" && m.subject === "Test", "mhtml header");
  ok(m.html.includes('<h1 class="t">Café سلام long</h1>'), `mhtml quoted-printable UTF-8 + soft break (${m.html})`);
  ok(m.resources.size === 2 && m.resources.get("https://s.alicdn.com/kf/Hx.png")?.read().equals(png), "mhtml base64 image bytes");
  ok(m.resources.get("cid:css-1@mhtml.blink")?.type === "text/css", "css kept as a lazy resource");
  ok(parseAlibabaProduct(m.html, { url: m.url }).productId === "1234567890123", "product id from snapshot url");
  let err = null;
  try {
    parseMhtml(Buffer.from("<html>not mhtml</html>"));
  } catch (e) {
    err = e;
  }
  ok(err instanceof MhtmlError, "non-MHTML file → MhtmlError");
  ok(decodeQuotedPrintable(Buffer.from("a=3Db=\nc=ZZ")).toString() === "a=bc=ZZ", "qp: LF soft break, invalid escape kept");
}

console.log(`${n} checks${fails ? `, ${fails} FAILED` : ", ALL PASSED"}`);
process.exitCode = fails ? 1 : 0;
