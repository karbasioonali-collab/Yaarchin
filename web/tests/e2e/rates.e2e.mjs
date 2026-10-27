// نرخ‌ها و هزینه‌ها (پنل ← نرخ‌ها): نرخ ارز با تاریخ شمسی، نسخه‌ی تازه‌ی حمل، آیتم هزینه، مالیات، HS code، ماشین‌حساب پنل
// و «اطلاعات ناقص». هر تغییر باید همان لحظه قیمت تمام‌شده‌ی سایت را عوض کند. ردیف‌های تستی (یادداشت e2e-…) آخر کار پاک می‌شوند.
// اجرا: TEST_DB=… node tests/e2e/rates.e2e.mjs — docs/infoyaarchin.md بخش ۲۱ و ۲۸.
import { B, admin, done, launch, ok, psql, vis, waitFor } from "./lib.mjs";

const NOTE = `e2e-${Date.now().toString(36)}`;
const SLUG = "juicer-300w";
const today = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const landed = async (qty = 500) => (await (await fetch(B + `/api/v1/products/${SLUG}/landed?qty=${qty}`)).json()).landed;
const unit = async (m) => (await landed()).methods.find((x) => x.key === m)?.unit;
const cleanup = () => {
  psql(`delete from exchange_rates where note='${NOTE}'`);
  psql(`delete from shipping_method_versions where note='${NOTE}'`);
  psql(`delete from tax_versions where note='${NOTE}'`);
  psql(
    `with v as (delete from cost_item_versions where item_id in (select item_id from cost_item_versions where note='${NOTE}') returning item_id) delete from cost_items where id in (select item_id from v)`,
  );
  psql(`delete from hs_code_versions where code='99999998'`);
  psql(`delete from hs_codes where code='99999998'`);
};

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
const flash = (re) => vis(ad.getByText(re));
// فرم‌های «نسخه‌ی تازه» داخل <details> بسته‌اند
const openAll = () => ad.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
const dateIn = (form) => form.locator('input[placeholder="۱۴۰۵/۰۷/۱۵"]').first();

ok((await landed()).status === "ready", "landed cost ready before changes");

// ---------- نرخ ارز ----------
await ad.goto(B + "/admin/rates");
await openAll();
ok(await vis(ad.getByRole("heading", { name: "نرخ فعلی ارزها (تومان)" })), "rates page");
const usd = Number(psql("select rate_toman from exchange_rates where currency_code='USD' and kind='market' order by rate_date desc, created_at desc limit 1"));
const u0 = await unit("air");
let form = ad.locator("form", { has: ad.locator('input[name="market_USD"]') });
await dateIn(form).fill("۱۴۰۴/۱۲/۳۰");
await form.locator('input[name="market_USD"]').fill(String(usd * 2));
await form.locator('[name="note"]').fill(NOTE);
await form.getByRole("button", { name: "ثبت نرخ‌ها" }).click();
await ad.waitForTimeout(800);
ok(psql(`select count(*) from exchange_rates where note='${NOTE}'`) === "0", "invalid Jalali date (30 Esfand 1404) blocks submit");
await dateIn(form).fill(today);
await form.getByRole("button", { name: "ثبت نرخ‌ها" }).click();
ok(await flash(/نرخ ثبت شد/), "rates saved with Jalali date");
ok(
  psql(`select rate_date::text from exchange_rates where note='${NOTE}' limit 1`) === new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tehran" }),
  "stored as Gregorian date of today (Tehran)",
);
const u1 = await unit("air");
ok(u1 > u0, `doubled USD rate raises landed cost (${u0} → ${u1})`);
await ad.goto(B + "/admin/rates");
ok(await vis(ad.getByText(NOTE).first()), "rate history shows new entry");

// ---------- حمل ----------
await ad.goto(B + "/admin/rates/shipping");
await openAll();
form = ad.locator("form", { has: ad.locator('input[name="methodKey"][value="air"]') });
const airDays0 = (await landed()).methods.find((x) => x.key === "air").days;
const airTransit0 = psql(
  "select transit_min_days || '|' || transit_max_days from shipping_method_versions where method_key='air' order by valid_from desc, created_at desc limit 1",
)
  .split("|")
  .map(Number);
const perKg = Number(await form.locator('input[name="ratePerKg"]').inputValue()) || 5;
await form.locator('input[name="ratePerKg"]').fill(String(perKg * 3));
await form.locator('input[name="transitMinDays"]').fill("3");
await form.locator('input[name="transitMaxDays"]').fill("4");
await form.locator('[name="note"]').fill(NOTE);
await form.getByRole("button", { name: "ثبت نسخه" }).click();
ok(await waitFor(() => psql(`select count(*) from shipping_method_versions where note='${NOTE}'`) === "1"), "shipping: new air version");
const u2 = await unit("air");
ok(u2 > u1, `higher air rate raises air landed cost (${u1} → ${u2})`);
const air = (await landed()).methods.find((x) => x.key === "air");
ok(
  air.days.max - air.days.min === airDays0.max - airDays0.min - (airTransit0[1] - airTransit0[0]) + 1,
  `delivery days use new transit 3–4 (${JSON.stringify(airDays0)} → ${JSON.stringify(air.days)})`,
);

// ---------- آیتم هزینه ----------
const s0 = await unit("sea");
await ad.goto(B + "/admin/rates/costs");
await openAll();
form = ad.locator("form", { has: ad.locator('input[name="nameFa"]') });
await form.locator('input[name="nameFa"]').fill(`هزینه‌ی تست ${NOTE}`);
await form.locator('select[name="calcType"]').selectOption("fixed");
await form.locator('[name="amount"]').fill("1000");
const cur = form.locator('select[name="currencyCode"], select[name="currency"]');
if (await cur.count()) await cur.first().selectOption("USD");
for (const c of await form.locator('input[name="methods"]').all()) await c.setChecked(true);
await form.locator('[name="note"]').fill(NOTE);
await form.getByRole("button", { name: "ساخت آیتم" }).click();
ok(await waitFor(() => psql(`select count(*) from cost_item_versions where note='${NOTE}'`) === "1"), "cost item created");
const s1 = await unit("sea");
ok(s1 > s0, `fixed 1000 USD cost raises sea landed cost (${s0} → ${s1})`);

// ---------- مالیات ----------
await ad.goto(B + "/admin/rates/tax");
await openAll();
form = ad.locator("form", { has: ad.locator('input[name="vatPercent"]') });
const vat = Number(await form.locator('input[name="vatPercent"]').inputValue()) || 10;
await form.locator('input[name="vatPercent"]').fill(String(vat + 20));
await form.locator('[name="note"]').fill(NOTE);
await form.getByRole("button", { name: "ثبت نسخه" }).click();
ok(await waitFor(() => psql(`select count(*) from tax_versions where note='${NOTE}'`) === "1"), "tax: new version");
const s2 = await unit("sea");
ok(s2 > s1, `higher VAT raises landed cost (${s1} → ${s2})`);

// ---------- HS ----------
await ad.goto(B + "/admin/rates/hs");
await openAll();
form = ad.locator("form", { has: ad.locator('input[name="titleFa"]') });
await form.locator('input[name="code"]').fill("99999998");
await form.locator('input[name="titleFa"]').fill(`کد تست ${NOTE}`);
await form.locator('select[name="dutyType"]').selectOption("percent");
await form.locator('[name="dutyValue"]').fill("15");
for (const c of await form.locator('input[name="dutyBase"]').all()) await c.setChecked(true).catch(() => {});
await form.getByRole("button", { name: "ثبت" }).click();
ok(await waitFor(() => psql("select count(*) from hs_code_versions where code='99999998'") === "1"), "HS code registered");
ok((await ad.goto(B + "/admin/rates/hs/99999998")).status() === 200 && (await vis(ad.getByText(`کد تست ${NOTE}`).first())), "HS code page");
await ad.goto(B + "/admin/rates/hs?q=99999998");
ok(await vis(ad.locator('a[href="/admin/rates/hs/99999998"]')), "HS search finds code");
ok((await ad.goto(B + "/admin/rates/hs/import")).status() === 200, "HS import page");

// ---------- ماشین‌حساب پنل و اطلاعات ناقص ----------
const pid = psql(`select id from products where slug='${SLUG}'`);
await ad.goto(B + `/admin/rates/calculator?product=${pid}&qty=500`);
ok((await vis(ad.getByText("هوایی کامل"))) && (await vis(ad.getByText("نرخ‌های استفاده‌شده"))), "admin calculator: full breakdown with rates used");
await ad.goto(B + "/admin/rates/missing");
ok(await vis(ad.getByRole("heading", { name: /محصول با اطلاعات ناقص/ })), "missing-data page");

// ---------- برگشت ----------
cleanup();
ok((await unit("air")) === u0, "after cleanup landed cost back to original");
console.log("page errors:", errs.length ? errs : "none");
ok(!errs.length, "no JS page errors");
await b.close();
done();
process.exit();
