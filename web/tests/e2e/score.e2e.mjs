// امتیاز «جذاب برای واردات» (پنل ← محصولات): ثبت، برداشتن، نمایش ستاره‌ها در سایت، لاگ و «آخرین تغییر»، دسترسی products.rate.
// امتیاز دو محصول را عوض می‌کند و آخر کار به مقدار اول برمی‌گرداند. اجرا: TEST_DB=… node tests/e2e/score.e2e.mjs — docs/infoyaarchin.md بخش ۲۰.
import { B, admin, done, expert, launch, ok, psql, setS, vis, waitFor } from "./lib.mjs";

const t0 = psql("select now()");
const A = "portable-blender";
const K = "kraft-paper-bag";
const orig = Object.fromEntries([A, K].map((s) => [s, psql(`select coalesce(import_score::text,'') from products where slug='${s}'`)]));
psql(`update products set import_score=4.5 where slug='${A}'`);
psql(`update products set import_score=null where slug='${K}'`);
const title = (s) => psql(`select title_fa from products where slug='${s}'`);

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
const site = await page();
// ستاره‌های خود محصول (کنار عنوان)، نه کارت‌های «محصولات مشابه»
const stars = (p) =>
  p
    .locator("h1")
    .locator("xpath=..")
    .getByRole("img", { name: /امتیاز جذابیت برای واردات/ });

await site.goto(B + `/p/${A}`);
ok((await stars(site).getAttribute("aria-label")) === "امتیاز جذابیت برای واردات: ۴٫۵ از ۵" && (await vis(site.getByText("جذاب برای واردات"))), "site: 4.5 stars under title");
await site.goto(B + `/p/${K}`);
ok((await stars(site).count()) === 0, "site: no score → no stars");

const setScore = async (slug, v) => {
  await ad.goto(B + "/admin/products");
  const sel = ad.getByLabel(`امتیاز ${title(slug)}`);
  await sel.selectOption(v);
  await sel.locator("xpath=ancestor::form").getByRole("button", { name: "ذخیره" }).click();
};
await setScore(A, "");
ok(await waitFor(() => psql(`select coalesce(import_score::text,'null') from products where slug='${A}'`) === "null"), "admin: remove score");
await setScore(K, "4");
ok(await waitFor(() => psql(`select import_score::text from products where slug='${K}'`) === "4.0"), "admin: set score 4");
await site.goto(B + `/p/${A}`);
ok((await stars(site).count()) === 0, "site: removed score disappears");
await site.goto(B + `/p/${K}`);
ok((await stars(site).getAttribute("aria-label")) === "امتیاز جذابیت برای واردات: ۴ از ۵", "site: new score shows");
await site.goto(B + `/c/${psql(`select c.slug from products p join categories c on c.id=p.category_id where p.slug='${K}'`)}`);
ok(
  (await site
    .locator(`a[href="/p/${K}"]`)
    .filter({ has: site.getByRole("img", { name: "امتیاز جذابیت برای واردات: ۴ از ۵" }) })
    .count()) >= 1,
  "category card shows stars",
);
ok(psql(`select count(*) from activity_log where action='product.import_score' and created_at > '${t0}'`) === "2", "activity log: exactly 2 score changes");
await ad.goto(B + "/admin/products");
ok(await vis(ad.getByText(/آخرین تغییر: .*۴٫۵ ← بدون امتیاز/)), "admin: «last change» line with before → after");
await setScore(K, "4");
ok(psql(`select count(*) from activity_log where action='product.import_score' and created_at > '${t0}'`) === "2", "same value → no new log");

// کارشناس بدون products.rate (با اجرای دسترسی‌ها) نمی‌تواند امتیاز بدهد
setS("auth.enforce_permissions", true);
const ex = await page();
await expert(ex);
await ex.goto(B + "/admin/products");
const can = psql("select count(*) from role_permissions rp join roles r on r.id=rp.role_id where r.key='expert' and rp.permission_key='products.rate'") !== "0";
ok(can || (await ex.getByLabel(`امتیاز ${title(K)}`).count()) === 0, "expert without products.rate: no score form");
setS("auth.enforce_permissions", false);

for (const [s, v] of Object.entries(orig)) psql(`update products set import_score=${v === "" ? "null" : v} where slug='${s}'`);
console.log("page errors:", errs.length ? errs : "none");
ok(!errs.length, "no JS page errors");
await b.close();
done();
process.exit();
