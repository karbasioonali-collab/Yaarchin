// بخش ۴۱: قیمت «کالا + حمل تا مرز ایران» برای محصول بدون HS (یا HS خارج از لیست)، «معادل X تومان» زیر میانگین دلاری،
// «پیشنهاد بسته‌بندی از مشخصات» در صفحه‌ی محصول و هشدار HS در پنل.
// اجرا: TEST_DB=postgres://…/yarchin_e2e node tests/e2e/border-price.e2e.mjs
import { readFileSync } from "node:fs";
import { B, admin, done, launch, ok, psql, setS, sleep, vis, waitFor } from "./lib.mjs";

const run = Date.now().toString(36);
const one = (q) => psql(q).split("\n")[0];
const s3 = JSON.parse(readFileSync(new URL("../fixtures/alibaba/sample3.expected.json", import.meta.url), "utf8"));
setS("auth.enforce_permissions", false);

// محصول منتشرشده با قیمت و بسته‌بندی کامل، بدون HS
const SLUG = `border-${run}`;
const prod = one(
  `insert into products (slug, title_fa, status, price_unit, published_at, unit_weight_kg, units_per_carton, carton_length_cm, carton_width_cm, carton_height_cm, carton_weight_kg)
   values ('${SLUG}', 'محصول مرز ${run}', 'published', 'piece', now(), 0.5, 20, 40, 30, 30, 11) returning id`,
);
const co = one(`insert into companies (name_en) values ('Border Co ${run}') returning id`);
const lst = one(`insert into product_listings (product_id, company_id, moq) values ('${prod}', '${co}', 100) returning id`);
psql(`insert into price_observations (listing_id, observed_at, currency, unit, min_qty, max_qty, price_min) values ('${lst}', now(), 'USD', 'piece', 100, null, 2)`);
// محصول بدون بسته‌بندی (استعلام) با مشخصات نمونه‌ی ۳ برای «پیشنهاد از مشخصات»
const bare = one(
  `insert into products (slug, title_fa, status, price_unit, published_at) values ('bare-${run}', 'محصول بی‌بسته‌بندی ${run}', 'published', 'piece', now()) returning id`,
);
const lst2 = one(
  `insert into product_listings (product_id, company_id, moq, specs) values ('${bare}', '${co}', 100, '${JSON.stringify({ attributes: s3.attributes }).replace(/'/g, "''")}') returning id`,
);
psql(`insert into price_observations (listing_id, observed_at, currency, unit, min_qty, max_qty, price_min) values ('${lst2}', now(), 'USD', 'piece', 100, null, 2)`);

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
const api = (u) => ad.evaluate(async (x) => (await fetch(x, { cache: "no-store" })).json(), u);

// ---------- بدون HS ← فقط کالا + حمل ----------
{
  const l = (await api(`/api/v1/products/${SLUG}/landed?qty=100`)).landed;
  const m = l.methods.find((x) => x.status === "border");
  ok(
    l.status === "ready" && l.borderOnly === true && m && m.unit > 0 && m.total > 0,
    `API: borderOnly, status border with a number (${JSON.stringify(l.methods.map((x) => x.status))})`,
  );
  ok(!l.methods.some((x) => x.status === "ok"), "no method claims a full landed cost");
  await ad.goto(B + `/p/${SLUG}`);
  ok((await ad.getByTestId("landed-title").innerText()).includes("قیمت تا مرز ایران"), "card title «قیمت تا مرز ایران»");
  ok((await ad.getByTestId("border-note").innerText()).includes("قیمت کالا و حمل تا مرز ایران؛ هزینه‌های گمرک، ترخیص و بیمه را کارشناس اعلام می‌کند"), "border note");
  // ماشین‌حساب پنل: فقط کالا و حمل
  await ad.goto(B + `/admin/rates/calculator?product=${prod}&qty=100`);
  const calc = await ad.locator("main").innerText();
  ok(calc.includes("فقط کالا + حمل تا مرز (بدون HS)") && calc.includes("جمع تا مرز ایران"), "admin calculator: border badge and total");
  ok(!calc.includes("حقوق ورودی (HS") && !calc.includes("مالیات ارزش افزوده"), "no duty or VAT lines");
  // عدد = کالا + حمل (جمع ردیف‌های همین دو بخش)
  await ad.goto(B + `/admin/products/${prod}`);
  ok((await ad.getByTestId("hs-warning").innerText()).includes("HS این محصول ثبت نشده"), "panel: no-HS notice");
}

// ---------- HS خارج از لیست ← مثل بدون HS + هشدار ----------
{
  psql(`update products set hs_code = '9999.99.99' where id='${prod}'`);
  const l = (await api(`/api/v1/products/${SLUG}/landed?qty=100`)).landed;
  ok(l.borderOnly === true, "HS not in list → border only");
  await ad.goto(B + `/admin/products/${prod}`);
  ok((await ad.getByTestId("hs-warning").innerText()).includes("در لیست HS نیست"), "panel: «HS این محصول در لیست HS نیست»");
}

// ---------- HS معتبر ← کامل، مثل قبل ----------
{
  const hs = one("select code from hs_code_versions where is_active and valid_from <= now() order by id limit 1");
  psql(`update products set hs_code = '${hs}' where id='${prod}'`);
  const l = (await api(`/api/v1/products/${SLUG}/landed?qty=100`)).landed;
  ok(l.borderOnly === false && l.methods.some((x) => x.status === "ok"), `valid HS → full landed cost (${hs})`);
  await ad.goto(B + `/p/${SLUG}`);
  ok(
    (await ad.getByTestId("landed-title").innerText()).includes("قیمت تمام‌شده تا ایران") && (await ad.getByTestId("border-note").count()) === 0,
    "full: normal title, no border note",
  );
  await ad.goto(B + `/admin/products/${prod}`);
  ok((await ad.getByTestId("hs-warning").count()) === 0, "valid HS: no warning");
}

// ---------- بدون بسته‌بندی ← استعلام (مثل قبل) ----------
{
  const l = (await api(`/api/v1/products/bare-${run}/landed?qty=100`)).landed;
  ok(
    l.methods.every((x) => x.status === "inquiry"),
    "no packing → inquiry",
  );
}

// ---------- «معادل X تومان» ----------
{
  const usd = Number(
    one(
      "select rate_toman from exchange_rates where currency_code='USD' and kind='market' and rate_date <= (now() at time zone 'Asia/Tehran')::date order by rate_date desc, created_at desc, id desc limit 1",
    ),
  );
  const pr = (await api(`/api/v1/products/${SLUG}`)).product;
  ok(Math.abs(pr.priceToman.avg - 2 * usd) < 1e-6, `API: exact toman = avg × USD rate (${pr.priceToman.avg})`);
  await ad.goto(B + `/p/${SLUG}`);
  const row = await ad.getByTestId("price-toman").innerText();
  const want = (Math.round((2 * usd) / 10) * 10).toLocaleString("fa-IR");
  ok(row.includes("معادل") && row.includes(want) && row.includes("تومان"), `«معادل ${want} تومان» (${row})`);
  ok(row.includes(pr.priceToman.isToday ? "با نرخ امروز دلار" : "با نرخ "), "rate note");
  const st = await ad.getByTestId("price-toman").evaluate((el) => {
    const n = el.querySelector("span:nth-child(2)");
    const usdEl = document.querySelector('[class*="avg_"], [class*="avg"]');
    const c = getComputedStyle(n);
    return { color: c.color, size: c.fontSize, weight: c.fontWeight };
  });
  ok(st.color === "rgb(47, 125, 92)" && st.size === "32px" && st.weight === "900", `toman number: brand green, 32px, 900 (${JSON.stringify(st)})`);
  // نرخ امروز نیست ← تاریخ آخرین نرخ
  psql(
    `update exchange_rates set rate_date = rate_date - 3 where currency_code='USD' and kind='market' and rate_date = (select max(rate_date) from exchange_rates where currency_code='USD' and kind='market')`,
  );
  await ad.reload();
  const row2 = await ad.getByTestId("price-toman").innerText();
  ok(/با نرخ [۰-۹]+ \S+/.test(row2) && !row2.includes("امروز"), `old rate → «با نرخ <date>» (${row2})`);
  psql(
    `update exchange_rates set rate_date = rate_date + 3 where currency_code='USD' and kind='market' and rate_date = (select max(rate_date) from exchange_rates where currency_code='USD' and kind='market')`,
  );
  // موبایل: بدون اسکرول افقی
  const mob = await page({ viewport: { width: 360, height: 800 } });
  await mob.goto(B + `/p/${SLUG}`);
  ok(await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "mobile: no horizontal scroll");
}

// ---------- پیشنهاد بسته‌بندی از مشخصات ----------
{
  await ad.goto(B + `/admin/products/${bare}`);
  const box = ad.getByTestId("packing-suggest");
  ok(await vis(box), "suggestion box for empty packing fields");
  const w = ad.getByTestId("suggest-unitWeightKg");
  ok((await w.innerText()).includes("0.005 kg"), "unit weight 0.005 kg from «Single gross weight»");
  ok((await ad.getByTestId("suggest-unitDims").innerText()).includes("9×9×3.1 cm"), "unit package size shown as info");
  ok((await ad.locator('form [name="unitWeightKg"]').inputValue()) === "", "not filled automatically");
  await w.getByRole("button", { name: "استفاده" }).click();
  ok((await ad.locator('form [name="unitWeightKg"]').inputValue()) === "0.005", "«استفاده» fills the field");
  ok(psql(`select coalesce(unit_weight_kg::text, '-') from products where id='${bare}'`) === "-", "not saved until «ذخیره‌ی محصول»");
  // با تعداد در کارتن ← تخمین کارتن
  psql(`update products set units_per_carton = 100 where id='${bare}'`);
  await ad.reload();
  const cd = ad.getByTestId("suggest-cartonDims");
  ok((await cd.innerText()).includes("تخمینی"), "carton dims estimated from unit size × units per carton");
  await cd.getByRole("button", { name: "استفاده" }).click();
  ok(
    (await ad.locator('form [name="cartonLengthCm"]').inputValue()) !== "" && (await ad.locator('form [name="cartonHeightCm"]').inputValue()) !== "",
    "fills all three carton fields",
  );
  await ad.getByRole("button", { name: "ذخیره‌ی محصول" }).click();
  ok(await waitFor(() => psql(`select carton_length_cm is not null from products where id='${bare}'`) === "t"), "saved after «ذخیره‌ی محصول»");
}

for (const p of [prod, bare]) {
  psql(`delete from price_observations where listing_id in (select id from product_listings where product_id='${p}')`);
  psql(`delete from product_listings where product_id='${p}'`);
  psql(`delete from products where id='${p}'`);
}
psql(`delete from companies where id='${co}'`);
await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
