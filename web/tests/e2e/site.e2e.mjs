// سایت عمومی: صفحه‌ی اصلی، دسته‌ها، صفحه‌ی محصول (قیمت کارخانه، قیمت تمام‌شده، محرمانگی کارخانه)، درباره و تماس، API عمومی، موبایل.
// پیش‌نیاز: دیتابیس با seed-demo (setup-db.sh). اجرا: TEST_DB=… node tests/e2e/site.e2e.mjs — docs/infoyaarchin.md بخش ۱۵، ۱۶ و ۲۱.
import { B, devices, done, launch, ok, psql, vis } from "./lib.mjs";

const { b, errs, page } = await launch();
const p = await page();
const run = Date.now().toString(36);

// ---------- صفحه‌ی اصلی ----------
let r = await p.goto(B + "/");
ok(r.status() === 200, "home 200");
ok(await vis(p.getByRole("heading", { name: "دسته‌بندی محصولات" })), "home: category boxes section");
ok(await vis(p.getByRole("heading", { name: "محصولات تازه" }).first()), "home: latest products section");
ok((await p.locator('main a[href^="/p/"]').count()) >= 4, "home: product cards link to /p/");
ok(await vis(p.getByRole("button", { name: "اسلاید بعدی" })), "home: slider controls");
ok(await vis(p.getByLabel("یارچین چطور کار می‌کند")), "home: how it works");
ok((await p.title()).length > 0 && (await p.locator('meta[name="description"]').count()) === 1, "home: title + description meta");

// ---------- دسته‌ها ----------
r = await p.goto(B + "/categories");
ok(r.status() === 200 && (await p.locator('main a[href^="/c/"]').count()) >= 3, "categories: top-level boxes");
const top = psql("select slug from categories where parent_id is null and status='active' order by sort_order, slug limit 1");
const sub = psql(`select count(*) from products p where p.status='published' and p.category_id in (
  with recursive t as (select id from categories where slug='${top}' union all select c.id from categories c join t on c.parent_id=t.id) select id from t)`);
r = await p.goto(B + `/c/${top}`);
ok(r.status() === 200, `category /c/${top} 200`);
ok(await vis(p.getByRole("heading", { name: new RegExp(`محصولات \\(${Number(sub).toLocaleString("fa-IR")}\\)`) })), `category shows products of whole subtree (${sub})`);
ok((await p.goto(B + "/c/no-such-category-xyz")).status() === 404, "unknown category 404");

// ---------- صفحه‌ی محصول ----------
const slug = "juicer-300w";
r = await p.goto(B + `/p/${slug}`);
ok(r.status() === 200, "product 200");
const title = psql(`select title_fa from products where slug='${slug}'`);
ok(await vis(p.getByRole("heading", { level: 1, name: title })), "product: title");
ok((await vis(p.getByText("قیمت کارخانه در چین"))) && (await vis(p.getByText("میانگین"))), "product: factory price stats");
ok(await vis(p.getByText("قیمت تمام‌شده تا ایران")), "product: landed cost card");
ok(await vis(p.getByText(/قیمت تخمینی است/)), "product: landed estimate note");
const air1 = await p.locator("text=هوایی").locator("..").innerText();
const qty = p.locator('input[inputmode="numeric"]').first();
await qty.fill("1000");
await p.waitForTimeout(1500);
const air2 = await p.locator("text=هوایی").locator("..").innerText();
ok(air1 !== air2, "product: changing quantity recalculates landed cost");
ok((await vis(p.getByText("مشخصات مشترک"))) && (await vis(p.getByText("توضیحات", { exact: true }))), "product: specs + description");
ok(await vis(p.getByText(/اطلاعات کارخانه‌ها محرمانه است/)), "product: supplier confidentiality note");
const html = await p.content();
const companies = psql("select name_en from companies").split("\n").filter(Boolean);
ok(!companies.some((n) => html.includes(n)), "product: no factory name anywhere in page HTML");
ok(!/hs_?code|85\d{6}/i.test(await p.locator("main").innerText()), "product: no HS code shown");
ok(await vis(p.getByText("برای گفتگو با کارشناس باید وارد شوید.")), "product: chat asks guest to log in");
ok(await vis(p.getByRole("heading", { name: "محصولات مشابه" })), "product: related products");
ok((await p.goto(B + "/p/no-such-product-xyz")).status() === 404, "unknown product 404");
const draft = psql("select slug from products where status <> 'published' limit 1");
if (draft) ok((await p.goto(B + `/p/${draft}`)).status() === 404, "unpublished product 404");

// ---------- API عمومی ----------
const api = async (u) => {
  const res = await fetch(B + u);
  const t = await res.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {}
  return { s: res.status, j, t };
};
const list = await api("/api/v1/products?limit=50");
ok(list.s === 200 && list.j.products.length >= 5, "API: product list");
ok(!companies.some((n) => list.t.includes(n)) && !/supplier(Name|Id)|companyId|hsCode/i.test(list.t), "API: no supplier identity or HS code");
const one = await api(`/api/v1/products/${slug}`);
ok(one.s === 200 && !companies.some((n) => JSON.stringify(one.j).includes(n)), "API: product detail without factory names");
const landed = await api(`/api/v1/products/${slug}/landed?qty=500`);
ok(landed.s === 200 && landed.j.landed.status === "ready" && landed.j.landed.qty === 500 && landed.j.landed.methods.length >= 1, "API: landed cost for qty");
ok((await api("/api/v1/categories")).s === 200, "API: categories");
ok((await api("/api/v1/health")).j?.db === "up", "health: db up");
ok((await fetch(B + "/robots.txt")).status === 200, "robots.txt");

// ---------- درباره و تماس ----------
ok((await p.goto(B + "/about")).status() === 200 && (await vis(p.getByRole("heading", { name: "درباره‌ی یارچین" }))), "about page");
await p.goto(B + "/contact");
const before = Number(psql("select count(*) from contact_messages"));
await p.fill('input[name="name"]', "تست سایت " + run);
await p.fill('input[name="contact"]', "09120000000");
const subj = p.locator('[name="subject"]');
if ((await subj.evaluate((e) => e.tagName)) === "SELECT") await subj.selectOption({ index: 1 });
else await subj.fill("موضوع تست");
await p.fill('textarea[name="message"]', "این یک پیام تست خودکار است. " + run);
await p.getByRole("button", { name: "ارسال پیام" }).click();
ok(await vis(p.getByText(/دریافت شد|ارسال شد|ممنون/)), "contact: success message");
ok(Number(psql("select count(*) from contact_messages")) === before + 1, "contact: message saved");
// تله‌ی ربات (فیلد مخفی website): پیام ذخیره نمی‌شود
await p.goto(B + "/contact");
await p.fill('input[name="name"]', "ربات");
await p.fill('input[name="contact"]', "bot@example.com");
if ((await subj.evaluate((e) => e.tagName)) === "SELECT") await subj.selectOption({ index: 1 });
else await subj.fill("x");
await p.fill('textarea[name="message"]', "spam spam spam spam");
await p.locator('input[name="website"]').evaluate((e) => (e.value = "http://spam"));
await p.getByRole("button", { name: "ارسال پیام" }).click();
await p.waitForTimeout(1500);
ok(Number(psql("select count(*) from contact_messages")) === before + 1, "contact: honeypot blocks bot");

// ---------- مهمان و صفحه‌های نیازمند ورود ----------
await p.goto(B + "/favorites");
ok(await vis(p.getByRole("heading", { name: "ورود به یارچین" })), "favorites → login for guest");
await p.goto(B + `/p/${slug}`);
await p.getByRole("button", { name: "افزودن به علاقه‌مندی‌ها" }).first().click();
ok(await vis(p.getByText("برای این کار باید وارد شوید").first()), "favorite as guest → login prompt");

// ---------- موبایل ----------
const m = await (await b.newContext({ ...devices["iPhone 13"] })).newPage();
await m.goto(B + "/");
ok(await vis(m.getByRole("button", { name: "منو" })), "mobile: menu button");
const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok(overflow <= 1, `mobile: no horizontal scroll (${overflow}px)`);
await m.goto(B + `/p/${slug}`);
ok((await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, "mobile product: no horizontal scroll");

console.log("page errors:", errs.length ? errs : "none");
ok(!errs.length, "no JS page errors");
await b.close();
done();
process.exit();
