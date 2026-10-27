// پنل کاتالوگ: دسته‌ها (درخت، جابه‌جایی امن، ترتیب، مخفی، حذف امن)، کارخانه‌ها (تکراری، تماس، مکاتبه‌ی فقط افزودنی، مسدود)،
// محصول (ساخت، مشخصات، وزن و کارتن، انتشار، مخفی)، لیستینگ با قیمت دلاری/یوانی و پله‌ها، نوبت قیمت، زمان آماده‌سازی،
// و محرمانگی کارخانه در همه‌ی صفحه‌ها و APIهای عمومی. داده‌ی تستی آخر کار پاک می‌شود. همیشه آخرین تست (docs/infoyaarchin.md بخش ۲۲).
// اجرا: TEST_DB=… node tests/e2e/catalog.e2e.mjs — docs/infoyaarchin.md بخش ۱۹.
import { B, admin, done, launch, ok, psql, setS, sleep, vis, waitFor } from "./lib.mjs";

const run = Date.now().toString(36);
const T = `t${run}`;
setS("auth.enforce_permissions", false);
const cleanup = () => {
  const pids = `(select id from products where slug like 'cat-test-%')`;
  psql(`delete from price_observations where listing_id in (select id from product_listings where product_id in ${pids})`);
  psql(`delete from lead_time_observations where listing_id in (select id from product_listings where product_id in ${pids})`);
  psql(`delete from company_correspondence where company_id in (select id from companies where name_en like 'Cat Test %')`);
  psql(`delete from product_listings where product_id in ${pids} or company_id in (select id from companies where name_en like 'Cat Test %')`);
  psql(`delete from product_media where product_id in ${pids}`);
  psql(`delete from products where slug like 'cat-test-%'`);
  psql(`delete from company_external_ids where company_id in (select id from companies where name_en like 'Cat Test %')`);
  psql(`delete from company_contacts where company_id in (select id from companies where name_en like 'Cat Test %')`);
  psql(`delete from company_categories where company_id in (select id from companies where name_en like 'Cat Test %')`);
  psql(`delete from companies where name_en like 'Cat Test %'`);
  psql(`delete from categories where slug like 'cat-test-%' and parent_id is not null`);
  psql(`delete from categories where slug like 'cat-test-%'`);
};
cleanup();

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);

// ---------- دسته‌ها ----------
const newCat = async (nameFa, slug, parentId = "") => {
  await ad.goto(B + "/admin/categories");
  const f = ad.locator("form", { has: ad.getByRole("button", { name: "ساخت دسته" }) });
  await f.locator('input[name="nameFa"]').fill(nameFa);
  await f.locator('input[name="slug"]').fill(slug);
  if (parentId) await f.locator('select[name="parentId"]').selectOption(parentId);
  await f.getByRole("button", { name: "ساخت دسته" }).click();
  await waitFor(() => psql(`select count(*) from categories where slug='${slug}'`) === "1");
  return psql(`select id from categories where slug='${slug}'`);
};
const P = await newCat(`دسته‌ی تست ${T}`, `cat-test-p-${run}`);
const C1 = await newCat(`زیرشاخه‌ی تست ${T}`, `cat-test-c-${run}`, P);
ok(!!P && psql(`select parent_id from categories where id='${C1}'`) === P, "category tree: child under parent");
await ad.goto(B + `/admin/categories/${P}`);
ok((await ad.locator(`select[name="parentId"] option[value="${C1}"]`).count()) === 0, "parent select hides own subtree");
await ad.locator('select[name="parentId"]').evaluate((s, id) => {
  const o = document.createElement("option");
  o.value = id;
  s.appendChild(o);
  s.value = id;
}, C1);
await ad.getByRole("button", { name: "ذخیره" }).click();
await ad.waitForTimeout(800);
ok(psql(`select coalesce(parent_id::text,'') from categories where id='${P}'`) === "", "server rejects moving category under its own child");
// مخفی ← زیرشاخه هم 404
await ad.goto(B + `/admin/categories/${P}`);
await ad.locator('select[name="status"]').selectOption({ index: 1 });
await ad.getByRole("button", { name: "ذخیره" }).click();
await waitFor(() => psql(`select status from categories where id='${P}'`) !== "active");
ok((await fetch(B + `/c/cat-test-c-${run}`)).status === 404, "hidden parent → child category 404");
await ad.goto(B + `/admin/categories/${P}`);
await ad.locator('select[name="status"]').selectOption("active");
await ad.getByRole("button", { name: "ذخیره" }).click();
await waitFor(() => psql(`select status from categories where id='${P}'`) === "active");
ok((await fetch(B + `/c/cat-test-c-${run}`)).status === 200, "visible again");
// حذف دسته‌ای که زیرشاخه دارد ممنوع
await ad.goto(B + `/admin/categories/${P}`);
ok(
  (await ad.getByRole("button", { name: "حذف دسته" }).count()) === 0 && (await vis(ad.getByText(/تا وقتی زیرشاخه دارد حذف نمی‌شود/))),
  "category with children: no delete, explains why",
);

// ---------- کارخانه ----------
await ad.goto(B + "/admin/companies/new");
await ad.locator('input[name="alibabaId"]').fill(`CAT-TEST ${run}`);
await ad.locator('input[name="nameEn"]').fill(`Cat Test ${T} Co., Ltd.`);
await ad.locator('input[name="nameFa"]').fill(`کارخانه‌ی تست ${T}`);
await ad.locator('textarea[name="notes"], input[name="notes"]').first().fill(`یادداشت محرمانه ${T}`);
await ad.getByRole("button", { name: "ثبت کارخانه" }).click();
ok(await waitFor(() => psql(`select count(*) from companies where name_en='Cat Test ${T} Co., Ltd.'`) === "1"), "company created");
const CO = psql(`select id from companies where name_en='Cat Test ${T} Co., Ltd.'`);
ok(psql(`select external_id from company_external_ids where company_id='${CO}'`) === `cat-test${run}`, "alibaba id normalized (no spaces, lowercase)");
await ad.goto(B + "/admin/companies/new");
await ad.locator('input[name="alibabaId"]').fill(`cat-test${run}`);
await ad.locator('input[name="nameEn"]').fill(`Cat Test Dup ${T}`);
await ad.getByRole("button", { name: "ثبت کارخانه" }).click();
ok(
  (await vis(ad.getByText(`Cat Test ${T} Co., Ltd.`).first())) && psql(`select count(*) from companies where name_en='Cat Test Dup ${T}'`) === "0",
  "duplicate alibaba id rejected, names existing company",
);
// تماس و مکاتبه
await ad.goto(B + `/admin/companies/${CO}`);
await ad.getByText("+ تماس جدید").click();
const cf = ad.locator("form", { has: ad.getByRole("button", { name: "افزودن تماس" }) });
await cf.locator('input[name="name"]').fill(`Contact ${T}`);
await cf.locator('input[name="email"]').fill(`contact-${run}@factory.example`);
await cf.getByRole("button", { name: "افزودن تماس" }).click();
ok(await waitFor(() => psql(`select count(*) from company_contacts where company_id='${CO}'`) === "1"), "contact added");
await ad.reload();
const corr = ad.locator("form", { has: ad.locator('textarea[name="body"]') });
await corr.locator('textarea[name="body"]').fill(`متن مکاتبه‌ی محرمانه ${T}`);
await corr.getByRole("button", { name: "ثبت" }).click();
ok(await waitFor(() => psql(`select count(*) from company_correspondence where company_id='${CO}'`) === "1"), "correspondence added (append-only)");
await ad.reload();
ok((await ad.getByRole("button", { name: /ویرایش مکاتبه|حذف مکاتبه/ }).count()) === 0, "correspondence has no edit/delete");

// ---------- محصول ----------
await ad.goto(B + "/admin/products/new");
await ad.locator('input[name="titleFa"]').fill(`محصول تست کاتالوگ ${T}`);
await ad.locator('input[name="slug"]').fill(`cat-test-${run}`);
await ad.locator('select[name="categoryId"]').selectOption(C1);
await ad.getByRole("button", { name: "ساخت محصول" }).click();
await ad.waitForURL(/created=1/);
const PR = psql(`select id from products where slug='cat-test-${run}'`);
ok(!!PR && psql(`select status from products where id='${PR}'`) === "draft", "product created as draft");
ok((await fetch(B + `/p/cat-test-${run}`)).status === 404, "draft not on site");
// مشخصات، وزن منفی رد، انتشار
await ad.locator('input[name="specLabel"]').first().fill("جنس");
await ad.locator('input[name="specValue"]').first().fill("استیل");
await ad.locator('input[name="unitWeightKg"]').fill("-2");
await ad.locator('select[name="status"]').selectOption("published");
await ad.getByRole("button", { name: "ذخیره‌ی محصول" }).click();
await ad.waitForTimeout(800);
ok(psql(`select status from products where id='${PR}'`) === "draft", "negative weight rejected (nothing saved)");
await ad.locator('input[name="unitWeightKg"]').fill("۰٫۴۵");
await ad.getByRole("button", { name: "ذخیره‌ی محصول" }).click();
ok(await waitFor(() => psql(`select status || '|' || unit_weight_kg from products where id='${PR}'`) === "published|0.450"), "published with Persian decimal weight");
ok(psql(`select published_at is not null from products where id='${PR}'`) === "t", "published_at set");

// لیستینگ و قیمت
await ad.getByText("+ افزودن کارخانه (لیستینگ)").click();
const lf = ad.locator("form", { has: ad.locator('select[name="companyId"]') });
await lf.locator('select[name="companyId"]').selectOption(CO);
await lf.locator('input[name="moq"]').fill("100");
await lf.getByRole("button", { name: "افزودن" }).click();
await ad.waitForURL(/\/listings\//);
const L = psql(`select id from product_listings where product_id='${PR}' and company_id='${CO}'`);
ok(!!L, "listing created → listing page");
const priceForm = () => ad.locator("form", { has: ad.getByRole("button", { name: "ثبت قیمت" }) });
const addTier = async (min, max, price) => {
  const f = priceForm();
  const n = await f.locator('input[name="tierMin"]').count();
  const i = (await f
    .locator('input[name="tierMin"]')
    .nth(n - 1)
    .inputValue())
    ? n
    : n - 1;
  if (i === n) await f.getByRole("button", { name: "+ پله‌ی تعداد" }).click();
  await f.locator('input[name="tierMin"]').nth(i).fill(String(min));
  await f
    .locator('input[name="tierMax"]')
    .nth(i)
    .fill(max ? String(max) : "");
  await f.locator('input[name="priceMin"]').nth(i).fill(String(price));
};
await priceForm().locator('select[name="currency"]').selectOption("USD");
await addTier(100, 499, 5);
await addTier(400, "", 4);
await priceForm().getByRole("button", { name: "ثبت قیمت" }).click();
await ad.waitForTimeout(800);
ok(psql(`select count(*) from price_observations where listing_id='${L}'`) === "0", "overlapping tiers rejected");
await ad.reload();
await priceForm().locator('select[name="currency"]').selectOption("USD");
await addTier(100, 499, 5);
await addTier(500, "", 4);
await priceForm().getByRole("button", { name: "ثبت قیمت" }).click();
ok(await waitFor(() => psql(`select count(*) from price_observations where listing_id='${L}'`) === "2"), "2 USD tiers saved");
let api = await (await fetch(B + `/api/v1/products/cat-test-${run}`)).json();
ok(JSON.stringify(api).includes("4") && api.product?.suppliers === 1, `site: 1 supplier, price from tiers (${JSON.stringify(api.product?.price)})`);
// نوبت تازه (بیش از ۲ ثانیه بعد) جایگزین نوبت قبلی در سایت؛ یوان با نرخ به دلار
await sleep(2500);
await ad.reload();
await priceForm().locator('select[name="currency"]').selectOption("CNY");
await addTier(100, "", 20);
await priceForm().getByRole("button", { name: "ثبت قیمت" }).click();
ok(await waitFor(() => psql(`select count(*) from price_observations where listing_id='${L}'`) === "3"), "new price batch (CNY) appended, history kept");
const cny = Number(psql("select rate_toman from exchange_rates where currency_code='CNY' and kind='market' order by rate_date desc, created_at desc limit 1"));
const usd = Number(psql("select rate_toman from exchange_rates where currency_code='USD' and kind='market' order by rate_date desc, created_at desc limit 1"));
api = await (await fetch(B + `/api/v1/products/cat-test-${run}`)).json();
const avg = api.product?.price?.avg;
ok(Math.abs(avg - (20 * cny) / usd) < 0.02, `site: latest batch only, CNY converted to USD (${avg} ≈ ${((20 * cny) / usd).toFixed(2)})`);
// زمان آماده‌سازی
await ad.locator('input[name="ltDays"]').first().fill("12");
await ad.getByRole("button", { name: "ثبت زمان آماده‌سازی" }).click();
ok(await waitFor(() => psql(`select count(*) from lead_time_observations where listing_id='${L}'`) === "1"), "lead time saved");

// کارخانه‌ی مسدود ← از سایت حذف
await ad.goto(B + `/admin/companies/${CO}`);
await ad.locator('select[name="status"]').first().selectOption("blocked");
await ad.getByRole("button", { name: "ذخیره", exact: true }).first().click();
await waitFor(() => psql(`select status from companies where id='${CO}'`) === "blocked");
api = await (await fetch(B + `/api/v1/products/cat-test-${run}`)).json();
ok((api.product?.suppliers ?? 0) === 0 && !api.product?.price, "blocked company's listing not counted on site");
await ad.locator('select[name="status"]').first().selectOption("active");
await ad.getByRole("button", { name: "ذخیره", exact: true }).first().click();
await waitFor(() => psql(`select status from companies where id='${CO}'`) === "active");

// ---------- محرمانگی: هیچ اثری از کارخانه در سایت و API ----------
const secrets = [`Cat Test ${T}`, `کارخانه‌ی تست ${T}`, `cat-test${run}`, `Contact ${T}`, `contact-${run}@factory.example`, `یادداشت محرمانه ${T}`, `متن مکاتبه‌ی محرمانه ${T}`];
const leaks = [];
for (const u of [
  "/",
  `/p/cat-test-${run}`,
  `/c/cat-test-c-${run}`,
  `/c/cat-test-p-${run}`,
  "/categories",
  `/api/v1/products/cat-test-${run}`,
  "/api/v1/products?limit=100",
  `/api/v1/products/cat-test-${run}/landed?qty=200`,
  "/api/v1/categories",
]) {
  const t = await (await fetch(B + u)).text();
  for (const s of secrets) if (t.includes(s)) leaks.push(`${u}: ${s}`);
}
ok(!leaks.length, `no factory name/id/contact/notes/correspondence on public pages and APIs (${leaks.join("; ") || "clean"})`);
const site = await page();
await site.goto(B + `/p/cat-test-${run}`);
ok((await vis(site.getByText("استیل"))) && (await vis(site.getByText("۱ کارخانه").first())), "site: specs + «1 factory»");

// محصول مخفی ← 404
await ad.goto(B + `/admin/products/${PR}`);
await ad.locator('select[name="status"]').selectOption("archived");
await ad.getByRole("button", { name: "ذخیره‌ی محصول" }).click();
ok(await waitFor(() => psql(`select status from products where id='${PR}'`) === "archived"), "product hidden (archived)");
ok((await fetch(B + `/p/cat-test-${run}`)).status === 404, "archived product 404");

// داده‌ی demo دست نخورده
api = await (await fetch(B + "/api/v1/products/portable-blender")).json();
ok(api.product?.suppliers === 3, "demo blender still 3 factories");

// لاگ
ok(
  Number(
    psql(
      `select count(*) from activity_log where (action like 'category.%' or action like 'company.%' or action like 'product.%' or action like 'listing.%' or action in ('price.add','lead_time.add','correspondence.create')) and created_at > now() - interval '10 minutes'`,
    ),
  ) >= 10,
  "catalog changes logged",
);

cleanup();
console.log("page errors:", errs.length ? errs : "none");
ok(!errs.length, "no JS page errors");
await b.close();
done();
process.exit();
