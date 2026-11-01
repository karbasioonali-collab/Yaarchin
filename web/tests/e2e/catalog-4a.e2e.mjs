// PR ۴الف (docs/infoyaarchin.md بخش ۳۸): قیمت «تعداد مرجع» در سایت و پنل، گرد کردن فقط در نمایش، جدول کارخانه‌ها با لینک‌ها و
// «میانگین چطور ساخته شده»، تعداد مرجع دستی، مشخصات ترکیبی، عکس‌ها (لیستینگ منبع، همه/هیچ‌کدام عمومی)، فیلتر کارخانه‌ها بر اساس محصول،
// آیکون خودکار دسته و هشدار مرورگر قدیمی.
// اجرا: TEST_DB=postgres://…/yarchin_e2e node tests/e2e/catalog-4a.e2e.mjs
import { readFileSync } from "node:fs";
import { B, admin, done, expert, launch, ok, psql, setS, sleep, vis, waitFor } from "./lib.mjs";

const run = Date.now().toString(36);
const SLUG = `ashtray-4a-${run}`;
const fx = (n) => JSON.parse(readFileSync(new URL(`../fixtures/alibaba/sample${n}.expected.json`, import.meta.url), "utf8"));
const one = (q) => psql(q).split("\n")[0];

// ---------- داده: زیرسیگاری با سه لیستینگ (فروشنده A: نمونه ۱ و ۲؛ B: نمونه ۳)، مثل ثبت مالک ----------
const prod = one(`insert into products (slug, title_fa, status, price_unit, published_at) values ('${SLUG}', 'زیرسیگاری آزمایشی ۴الف', 'published', 'piece', now()) returning id`);
const coA = one(
  `insert into companies (name_en, company_type, meta) values ('Supplier 4a A ${run}', 'trading', '{"alibaba":{"yearsOnAlibaba":1,"foundedYear":2016}}') returning id`,
);
const coB = one(`insert into companies (name_en, company_type) values ('Supplier 4a B ${run}', 'manufacturer') returning id`);
psql(`insert into company_external_ids (company_id, platform, external_id, url) values ('${coA}', 'alibaba', 'sa-${run}', 'https://supplier-a-${run}.en.alibaba.com/')`);
const lst = {};
for (const [n, co] of [
  [1, coA],
  [2, coA],
  [3, coB],
]) {
  const e = fx(n);
  const specs = JSON.stringify({ attributes: e.attributes }).replace(/'/g, "''");
  lst[n] = one(
    `insert into product_listings (product_id, company_id, moq, moq_unit, external_url, specs) values ('${prod}', '${co}', ${e.moq}, 'piece', 'https://www.alibaba.com/product-detail/x_${n}${run}.html', '${specs}') returning id`,
  );
  for (const t of e.priceTiers)
    psql(
      `insert into price_observations (listing_id, observed_at, currency, unit, min_qty, max_qty, price_min) values ('${lst[n]}', '2026-10-31T10:00:00Z', 'USD', 'piece', ${t.minQty}, ${t.maxQty ?? "null"}, ${t.price})`,
    );
}
for (const [i, n] of [
  [0, 1],
  [1, 3],
])
  psql(
    `insert into product_media (product_id, listing_id, kind, storage_key, is_public, sort_order) values ('${prod}', '${lst[n]}', 'image', '/media/icons/categories/general.svg?${i}', true, ${i})`,
  );

setS("auth.enforce_permissions", false);
const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
const apiGet = (p, u) => p.evaluate(async (x) => (await fetch(x)).json(), u);

// ---------- سایت: قیمت برای تعداد مرجع ----------
{
  const pr = (await apiGet(ad, `/api/v1/products/${SLUG}`)).product;
  ok(pr.price.refQty === 5000 && Math.abs(pr.price.avg - 0.035) < 1e-9 && pr.price.min === 0.02 && pr.price.max === 0.05, `API: ref qty 5000, exact avg 0.035 (${JSON.stringify(pr.price)})`);
  ok(pr.price.pricedSuppliers === 2, "2 suppliers at ref qty");
  ok(pr.landedCost.status !== "ready" || pr.landedCost.qty === 5000, "landed card opens at ref qty");
  await ad.goto(B + `/p/${SLUG}`);
  const card = await ad.getByTestId("ref-qty").innerText();
  ok(card.includes("برای سفارش ۵٬۰۰۰ عدد"), `site: «برای سفارش ۵٬۰۰۰ عدد» (${card})`);
  ok(await vis(ad.getByText("۰٫۰۳۵").first()), "site: 0.035 shown with 3 decimals");
  ok(!/Supplier 4a|alibaba\.com/.test(await ad.locator("main").innerText()), "site: no supplier name or link");
}

// ---------- گرد کردن تومان: قیمت هر عدد به ۱۰، جمع به ۱٬۰۰۰ ----------
{
  const led = (await apiGet(ad, `/api/v1/products/led-bulb-12w/landed?qty=500`)).landed;
  const m = (led.methods ?? []).find((x) => x.status === "ok");
  ok(m && m.unit % 10 === 0 && m.unit % 1000 !== 0 && m.total % 1000 === 0, `landed: unit to nearest 10, total to 1000 (${m && `${m.unit} / ${m.total}`})`);
}

// ---------- پنل: جدول کارخانه‌ها و «میانگین چطور ساخته شده» ----------
{
  await ad.goto(B + `/admin/products/${prod}`);
  const sum = await ad.getByTestId("ref-summary").innerText();
  ok(sum.includes("۵٬۰۰۰") && sum.includes("۰٫۰۳۵") && sum.includes("۱ لیستینگ با حداقل سفارش بیشتر حساب نشد"), `panel summary (${sum.slice(0, 160)})`);
  const cells = await ad.getByTestId("in-average").allInnerTexts();
  ok(cells.some((c) => c.includes("حساب نشد: حداقل سفارش ۳۰٬۰۰۰")) && cells.some((c) => c.includes("۰٫۰۵")) && cells.some((c) => c.includes("۰٫۰۲")), `per-listing: excluded and used prices (${cells.join(" / ")})`);
  const prof = ad.getByTestId("supplier-profile-link").first();
  ok((await prof.getAttribute("href")) === `https://supplier-a-${run}.en.alibaba.com/` && (await prof.getAttribute("target")) === "_blank", "profile link → Alibaba, new tab");
  const pl = ad.getByTestId("listing-product-link");
  ok((await pl.count()) === 3 && (await pl.first().getAttribute("target")) === "_blank", "product link per listing, new tab");
  ok((await ad.locator("table").filter({ hasText: "نوع و سابقه" }).innerText()).includes("سابقه در علی‌بابا: ۱ سال") && (await ad.locator("table").filter({ hasText: "نوع و سابقه" }).innerText()).includes("سال تأسیس: 2016"), "type, years and founded year");
}

// ---------- تعداد مرجع دستی ----------
{
  await ad.locator('input[name="referenceQty"]').fill("30000");
  await ad.getByRole("button", { name: "ذخیره‌ی تعداد مرجع" }).click();
  ok(await waitFor(() => psql(`select meta->>'referenceQty' from products where id='${prod}'`) === "30000"), "manual ref qty saved in products.meta");
  const pr = (await apiGet(ad, `/api/v1/products/${SLUG}`)).product;
  ok(pr.price.refQty === 30000 && Math.abs(pr.price.avg - 0.03) < 1e-9 && pr.price.pricedSuppliers === 2, `manual 30000 → avg 0.03, all listings (${JSON.stringify(pr.price)})`);
  await ad.goto(B + `/p/${SLUG}`);
  ok((await ad.getByTestId("ref-qty").innerText()).includes("۳۰٬۰۰۰"), "site shows manual qty");
  await ad.goto(B + `/admin/products/${prod}`);
  await ad.locator('input[name="referenceQty"]').fill("abc");
  await ad.getByRole("button", { name: "ذخیره‌ی تعداد مرجع" }).click();
  ok(await vis(ad.getByRole("alert").filter({ hasText: "تعداد مرجع باید عدد صحیح" })), "invalid ref qty → error");
  await ad.locator('input[name="referenceQty"]').fill("");
  await ad.getByRole("button", { name: "ذخیره‌ی تعداد مرجع" }).click();
  ok(await waitFor(() => psql(`select coalesce(meta->>'referenceQty','-') from products where id='${prod}'`) === "-"), "empty → back to default");
}

// ---------- مشخصات ترکیبی ----------
{
  await ad.goto(B + `/admin/products/${prod}`);
  const box = ad.getByTestId("specs-merge");
  ok(await vis(box), "specs merge box");
  const rows = box.getByTestId("merge-row");
  const supplierRows = rows.filter({ hasText: "اطلاعات کارخانه" });
  ok((await supplierRows.count()) > 0 && (await supplierRows.locator('input[name="pick"]').count()) === 0, "supplier info rows (brand/origin/model): not selectable");
  const mat = rows.filter({ hasText: /^Material/ }).first();
  ok((await mat.count()) === 1 && (await mat.innerText()).includes("مشترک"), "Material: common");
  ok((await rows.filter({ hasText: "متفاوت" }).count()) > 0, "some rows differ");
  ok((await mat.locator('input[aria-label="عنوان"]').inputValue()) === "جنس", "dictionary label جنس");
  await mat.locator('input[name="pick"]').check();
  await box.getByRole("button", { name: "افزودن انتخاب‌شده‌ها به مشخصات مشترک" }).click();
  ok(await waitFor(() => psql(`select specs::text like '%جنس%' from products where id='${prod}'`) === "t"), "picked row saved to product specs");
  await ad.goto(B + `/p/${SLUG}`);
  ok(await vis(ad.getByText("جنس").first()), "site shows the merged spec");
}

// ---------- عکس‌ها ----------
{
  await ad.goto(B + `/admin/products/${prod}`);
  const badges = await ad.getByTestId("media-listing").allInnerTexts();
  ok(badges.length === 2 && badges.some((x) => x.includes(`Supplier 4a B ${run}`)), `media: source listing badge (${badges.join(" / ")})`);
  await ad.getByTestId("media-bulk").getByRole("button", { name: "هیچ‌کدام عمومی" }).click();
  ok(await waitFor(() => psql(`select count(*) from product_media where product_id='${prod}' and is_public`) === "0"), "«none public»");
  await ad.getByTestId("media-bulk").getByRole("button", { name: "همه‌ی عکس‌ها عمومی" }).click();
  ok(await waitFor(() => psql(`select count(*) from product_media where product_id='${prod}' and is_public`) === "2"), "«all public»");
}

// ---------- کارخانه‌ها بر اساس محصول ----------
{
  await ad.goto(B + `/admin/companies?product=${prod}`);
  const t = await ad.locator("table").innerText();
  ok(t.includes(`Supplier 4a A ${run}`) && t.includes(`Supplier 4a B ${run}`) && psql(`select count(*) from companies`) !== "2", "companies filtered by product");
  ok((await ad.locator("tbody tr").count()) === 2, "only this product's 2 suppliers");
}

// ---------- دسترسی‌ها ----------
{
  setS("auth.enforce_permissions", true);
  const role = (keys) => {
    psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
    psql(`insert into role_permissions (role_id, permission_key) select r.id, k from roles r, unnest(array[${["dashboard.view", ...keys].map((k) => `'${k}'`).join(",")}]) k where r.key='expert'`);
  };
  const ex = await page();
  await expert(ex);
  role(["products.manage"]);
  await ex.goto(B + `/admin/products/${prod}`);
  ok((await ex.getByText(`Supplier 4a A ${run}`).count()) === 0 && (await ex.getByText("کارخانه‌ی ۱").count()) > 0, "no companies.view: suppliers anonymous");
  ok((await ex.locator('a[href*="alibaba.com"]').count()) === 0, "no links without companies.links");
  role(["products.manage", "companies.view"]);
  await ex.reload();
  ok((await ex.getByText(`Supplier 4a A ${run}`).count()) > 0 && (await ex.getByTestId("supplier-profile-link").count()) === 0, "companies.view: names, still no links");
  role(["products.manage", "companies.view", "companies.links"]);
  await ex.reload();
  ok((await ex.getByTestId("supplier-profile-link").count()) > 0, "companies.links: links shown");
  role([]);
  psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
  psql("insert into role_permissions (role_id, permission_key) select id, 'dashboard.view' from roles where key='expert'");
  setS("auth.enforce_permissions", false);
}

// ---------- آیکون خودکار دسته ----------
const catSlug = `ashtrays-4a-${run}`;
{
  await ad.goto(B + "/admin/categories");
  const f = ad.locator("form", { has: ad.getByRole("button", { name: "ساخت دسته" }) });
  await f.locator('input[name="nameFa"]').fill(`زیرسیگاری ${run}`);
  await f.locator('input[name="nameEn"]').fill("Ashtrays");
  await f.locator('input[name="slug"]').fill(catSlug);
  ok(await f.locator('input[name="icon"][value=""]').isChecked(), "new category: «خودکار» selected by default");
  await f.getByRole("button", { name: "ساخت دسته" }).click();
  ok(
    await waitFor(() => psql(`select image || '|' || (meta->>'autoIcon') from categories where slug='${catSlug}'`) === "/media/icons/categories/home-decor.svg|true"),
    "auto icon from name (ashtray → home-decor), flagged",
  );
  const id = psql(`select id from categories where slug='${catSlug}'`);
  // دستی: انتخاب آیکون دیگر ← autoIcon false
  await ad.goto(B + `/admin/categories/${id}`);
  await ad.locator('input[name="icon"][value="packaging"]').check();
  await ad.getByRole("button", { name: "ذخیره" }).first().click();
  ok(
    await waitFor(() => psql(`select image || '|' || (meta->>'autoIcon') from categories where id='${id}'`) === "/media/icons/categories/packaging.svg|false"),
    "manual icon kept, not auto",
  );
  // پر کردن دسته‌های بی‌عکس (به عکس دستی دست نمی‌زند)
  const empty = one(`insert into categories (name_fa, name_en, slug) values ('کیسه کاغذی ${run}', 'Paper Bags', 'empty-4a-${run}') returning id`);
  const manual = one(`insert into categories (name_fa, slug, image) values ('دستی ${run}', 'manual-4a-${run}', 'https://example.com/x.png') returning id`);
  await ad.goto(B + "/admin/categories");
  await ad.getByTestId("fill-icons").getByRole("button", { name: "پر کردن آیکونِ دسته‌های بی‌عکس" }).click();
  ok(await waitFor(() => psql(`select image from categories where id='${empty}'`) === "/media/icons/categories/packaging.svg"), "fill: empty category gets icon (paper bags → packaging)");
  ok(psql(`select image from categories where id='${manual}'`) === "https://example.com/x.png", "fill: manual image untouched");
  ok(psql(`select count(*) from categories where image is null`) === "0", "no category without image after fill");
  await ad.reload();
  ok((await ad.getByTestId("fill-icons").count()) === 0, "fill notice gone");
  psql(`delete from categories where id in ('${id}', '${empty}', '${manual}')`);
}

// ---------- مرورگر قدیمی ----------
{
  const old = await page({ userAgent: "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36" });
  await admin(old);
  const w = old.getByTestId("old-browser");
  ok(await vis(w), "Chrome 109 / Windows 7 → banner");
  ok((await w.innerText()).includes("Firefox ESR 115") && (await w.locator('a[href*="mozilla.org"]').count()) === 1, "suggests Firefox ESR for Windows 7");
  ok((await ad.getByTestId("old-browser").count()) === 0, "modern browser → no banner");
}

// ---------- پاکسازی ----------
psql(`delete from product_media where product_id='${prod}'`);
psql(`delete from price_observations where listing_id in (select id from product_listings where product_id='${prod}')`);
psql(`delete from product_listings where product_id='${prod}'`);
psql(`delete from products where id='${prod}'`);
psql(`delete from company_external_ids where company_id in ('${coA}', '${coB}')`);
psql(`delete from companies where id in ('${coA}', '${coB}')`);
await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
