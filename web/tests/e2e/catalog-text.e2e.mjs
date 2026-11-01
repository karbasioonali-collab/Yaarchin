// «متن فارسی محصول با AI» (PR ۴ب؛ migration ۰۰۱۴). docs/infoyaarchin.md بخش ۴۰.
//   AI_E2E=test ← سرور بدون کلید: فقط مشخصاتِ واژه‌نامه، هزینه صفر
//   AI_E2E=live ← سرور با AI_BASE_URL=http://127.0.0.1:3399/v1 (این تست خودش tests/e2e/mock-ai.mjs را بالا می‌آورد)
// اجرا: TEST_DB=postgres://…/yarchin_e2e AI_E2E=live node tests/e2e/catalog-text.e2e.mjs
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { B, admin, done, expert, launch, ok, psql, setS, sleep, vis, waitFor } from "./lib.mjs";

const MODE = process.env.AI_E2E;
if (MODE !== "live" && MODE !== "test") throw new Error("AI_E2E=live یا test");
const LIVE = MODE === "live";
const run = Date.now().toString(36);
const Z = "‌";
const one = (q) => psql(q).split("\n")[0];
const fx = (n) => JSON.parse(readFileSync(new URL(`../fixtures/alibaba/sample${n}.expected.json`, import.meta.url), "utf8"));

let mock;
if (LIVE) {
  mock = spawn(process.execPath, [new URL("./mock-ai.mjs", import.meta.url).pathname, "3399"], { stdio: ["ignore", "ignore", "inherit"] });
  process.on("exit", () => mock.kill());
  await sleep(500);
}
// به سوئیچ دستیار چت وابسته نیست
setS("features.ai_agent", false);
setS("auth.enforce_permissions", false);
setS("ai.catalog_daily_cost_toman", 20000);
psql("delete from ai_requests where purpose = 'catalog_text'");

// محصول با دو لیستینگ (نمونه ۱ و ۳)؛ اسم انگلیسی لیستینگ نشانه‌ی رفتار سرور ساختگی را دارد
const co = one(`insert into companies (name_en) values ('Supplier 4b Leak') returning id`);
const mkProduct = (slug, marker) => {
  const p = one(`insert into products (slug, title_fa, status) values ('${slug}-${run}', 'محصول ۴ب ${slug}', 'draft') returning id`);
  for (const n of [1, 3]) {
    const e = fx(n);
    const specs = JSON.stringify({ attributes: e.attributes, highlights: e.highlights }).replace(/'/g, "''");
    psql(`insert into product_listings (product_id, company_id, title_en, specs) values ('${p}', '${co}', '${(e.title + " " + marker).replace(/'/g, "''")}', '${specs}')`);
  }
  return p;
};
const good = mkProduct("good", "");
const leak = mkProduct("leak", "[[catleak]]");
const num = mkProduct("num", "[[catnum]]");
const bad = mkProduct("bad", "[[catbad]]");

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
const confirmAndRun = async (p) => {
  await ad.goto(B + `/admin/products/${p}`);
  await ad
    .getByTestId("ai-text")
    .getByRole("link", { name: /پیش‌نویس با AI/ })
    .click();
  await ad.getByTestId("ai-text-confirm").waitFor();
  await ad.getByRole("button", { name: "اجرا و ساخت پیش‌نویس" }).click();
  await ad.waitForURL(/[?&]draft=/, { timeout: 30000 });
};
const draftRow = (p) =>
  psql(`select status || '|' || coalesce(model, '-') || '|' || cost_toman::float from product_text_drafts where product_id='${p}' order by created_at desc limit 1`);

// ---------- صفحه‌ی تأیید ----------
{
  await ad.goto(B + `/admin/products/${good}?aiText=confirm`);
  const c = await ad.getByTestId("ai-text-confirm").innerText();
  ok(/۲ اسم انگلیسی/.test(c) && /ویژگی/.test(c) && /واژه‌نامه/.test(c), `confirm: what is sent (${c.slice(0, 120)})`);
  const sent = await ad.getByTestId("ai-text-input").textContent();
  ok(!/Brand Name|Place of Origin|Guangdong|Anhui|BrandB|MODEL-B01|Supplier 4b/.test(sent), "nothing about the supplier is sent");
  if (LIVE) ok(/\d|[۰-۹]/.test(await ad.getByTestId("ai-text-estimate").innerText()), "estimated cost shown before run");
  else ok(c.includes("حالت آزمایشی"), "test mode notice");
  ok(psql(`select count(*) from product_text_drafts where product_id='${good}'`) === "0", "nothing runs before confirm");
}

// ---------- اجرا ----------
await confirmAndRun(good);
if (!LIVE) {
  ok(draftRow(good) === "ready|-|0", `test mode: ready, no model, cost 0 (${draftRow(good)})`);
  ok((await ad.getByTestId("ai-draft-specs").first().innerText()).includes("شکل: گرد"), "test mode: dictionary specs");
  ok(psql("select count(*) from ai_requests where purpose='catalog_text' and mode='test'") === "1", "logged as test request");
} else {
  ok(draftRow(good).startsWith("ready|mock/primary|500"), `live: ready, model, cost from Liara usage (${draftRow(good)})`);
  ok(psql("select status || '|' || cost_toman::float from ai_requests where purpose='catalog_text' order by id desc limit 1") === "ok|500", "AI log: catalog_text, cost");
  const d = ad.getByTestId("ai-draft").first();
  const title = await d.getByTestId("ai-field-titleFa").innerText();
  ok(title.includes("زیرسیگاری یکبار مصرف ژل دار") && !title.includes("ي"), `normalized: ي → ی (${title})`);
  const sum = await d.getByTestId("ai-field-summaryFa").innerText();
  ok(sum.includes(`خاموش می${Z}کند.`), `normalized: می‌کند, no space before dot (${sum})`);
  ok((await d.getByTestId("ai-field-descriptionFa").innerText()).includes(`خانه${Z}ها`), "normalized: خانه‌ها");
  ok(
    (await d.getByTestId("ai-draft-specs").innerText()).includes("نوع: رومیزی") && (await d.getByTestId("ai-draft-specs").innerText()).includes("شکل: گرد"),
    "AI + dictionary specs",
  );
  // «بگذار در فرم» فقط فرم را پر می‌کند؛ تا «ذخیره‌ی محصول» چیزی عوض نمی‌شود
  await d.getByTestId("ai-field-summaryFa").getByRole("button", { name: "بگذار در فرم" }).click();
  ok((await ad.locator('form [name="summaryFa"]').inputValue()).startsWith("زیرسیگاری کاغذی"), "fill: summary in form");
  ok(psql(`select coalesce(summary_fa, '-') from products where id='${good}'`) === "-", "not saved until «ذخیره‌ی محصول»");
  await ad.getByRole("button", { name: "ذخیره‌ی محصول" }).click();
  ok(await waitFor(() => psql(`select summary_fa like 'زیرسیگاری کاغذی%' from products where id='${good}'`) === "t"), "saved after «ذخیره‌ی محصول»");
}
// مشخصات پیش‌نویس ← مشخصات مشترک (ذخیره‌ی صریح)
await ad.goto(B + `/admin/products/${good}#ai-text`);
await ad.getByTestId("ai-draft").first().getByRole("button", { name: "افزودن این مشخصات به مشخصات مشترک" }).click();
ok(await waitFor(() => psql(`select specs::text like '%گرد%' from products where id='${good}'`) === "t"), "draft specs → product specs");

if (LIVE) {
  // ---------- محافظ ----------
  // فهرست اسم کارخانه‌های محافظ ۶۰ ثانیه کش می‌شود (guard-terms.ts)؛ ذخیره‌ی فرم «کلمه‌های ممنوع» کش را پاک می‌کند تا کارخانه‌ی تازه‌ی تست دیده شود
  await ad.goto(B + "/admin/ai");
  await ad
    .locator("form", { has: ad.locator('textarea[name="terms"]') })
    .getByRole("button", { name: "ذخیره" })
    .click();
  await sleep(800);
  await confirmAndRun(leak);
  ok(draftRow(leak).startsWith("blocked|"), `supplier name + price → blocked (${draftRow(leak)})`);
  const hits = await ad.getByTestId("ai-draft-hits").first().innerText();
  ok(hits.includes("اسم") && hits.includes("قیمت یا ارز"), `hits shown (${hits})`);
  ok((await ad.getByTestId("ai-draft").first().getByRole("button", { name: "بگذار در فرم" }).count()) === 0, "blocked draft: no fill buttons");
  ok(psql("select status from ai_requests where purpose='catalog_text' order by id desc limit 1") === "guard_block", "AI log: guard_block");
  await confirmAndRun(num);
  ok(draftRow(num).startsWith("blocked|") && (await ad.getByTestId("ai-draft-hits").first().innerText()).includes("۵۰۰"), "invented number → blocked");
  await confirmAndRun(bad);
  ok(draftRow(bad).startsWith("error|"), `non-JSON → error (${draftRow(bad)})`);
  // ---------- سقف ----------
  setS("ai.catalog_daily_cost_toman", 1000);
  await ad.goto(B + `/admin/products/${good}?aiText=confirm`);
  ok(await vis(ad.getByRole("alert").filter({ hasText: "سقف روزانه" })), "cap reached → refused before run");
  ok((await ad.getByRole("button", { name: "اجرا و ساخت پیش‌نویس" }).count()) === 0, "no run button over cap");
  setS("ai.catalog_daily_cost_toman", 20000);
  // سقف در صفحه‌ی دستیار
  await ad.goto(B + "/admin/ai");
  ok((await ad.locator('input[name="catalogDailyCost"]').inputValue()).replace(/[٬,]/g, "") === "20000", "cap field on AI settings page");
}

// ---------- دسترسی‌ها ----------
{
  setS("auth.enforce_permissions", true);
  psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
  psql("insert into role_permissions (role_id, permission_key) select id, 'dashboard.view' from roles where key='expert'");
  const ex = await page();
  await expert(ex);
  const r = await ex.goto(B + `/admin/products/${good}`);
  ok(r.status() === 403 || !(await ex.getByTestId("ai-text").count()), "no products.manage → no AI text");
  psql("insert into role_permissions (role_id, permission_key) select id, 'products.manage' from roles where key='expert'");
  // بعد از ۴۰۳ آدرس صفحه‌ی «دسترسی ندارید» است؛ reload به محصول برنمی‌گردد
  await ex.goto(B + `/admin/products/${good}`);
  ok(await vis(ex.getByTestId("ai-text")), "products.manage → AI text card");
  psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
  psql("insert into role_permissions (role_id, permission_key) select id, 'dashboard.view' from roles where key='expert'");
  setS("auth.enforce_permissions", false);
}

for (const p of [good, leak, num, bad]) {
  psql(`delete from product_listings where product_id='${p}'`);
  psql(`delete from products where id='${p}'`);
}
psql(`delete from companies where id='${co}'`);
psql("delete from ai_requests where purpose = 'catalog_text'");
await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
