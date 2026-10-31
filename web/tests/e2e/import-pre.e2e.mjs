// قبل از migration ۰۰۱۲ (دیتابیس در ۰۰۱۱، مثل لیارا پیش از migrate): صفحه‌های «ورود از علی‌بابا» فقط پیام «بعد از migration»
// نشان دهند، آپلود ۴۰۹ بدهد، هیچ صفحه‌ای خراب نشود و دسترسی‌های تازه (seed نشده) چیزی را نشکنند. docs/infoyaarchin.md بخش ۳۶.
// اجرا: TEST_DB=postgres://…/yarchin_e2e_pre node tests/e2e/import-pre.e2e.mjs
import { B, admin, done, launch, ok, psql, setS } from "./lib.mjs";

ok(psql("select to_regclass('ai_test_cases') is not null and to_regclass('raw_pages') is null") === "t", "DB is at 0011 (before 0012)");
setS("auth.enforce_permissions", false);
const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
const r = await ad.goto(B + "/admin/import");
ok(r.status() === 200 && (await ad.getByText("migration ۰۰۱۲").count()) > 0, "/admin/import: not-ready notice");
ok((await ad.goto(B + "/admin/import/00000000-0000-0000-0000-000000000000")).status() === 404, "review page before migrate: 404");
// از داخل صفحه (کوکی نشست secure است و APIRequestContext پلی‌رایت آن را روی http نمی‌فرستد)
const up = await ad.evaluate(async () => (await fetch("/api/admin/import/upload", { method: "POST", headers: { "x-yc-upload": "1" }, body: "x" })).status);
ok(up === 409, `upload before migrate → 409 (${up})`);
for (const u of ["/admin", "/admin/products", "/admin/companies", "/admin/ai", "/admin/chats"]) ok((await ad.goto(B + u)).status() === 200, `${u} 200`);
// ویرایش محصول (دسترسی تازه‌ی products.publish؛ ادمین همه را دارد) و صفحه‌ی کارخانه (companies.links)
const prod = psql("select id from products order by created_at limit 1");
ok(
  (await ad.goto(B + `/admin/products/${prod}`)).status() === 200 && !(await ad.locator('select[name="status"] option[value="published"]').evaluate((o) => o.disabled)),
  "product page works; admin can publish",
);
const co = psql("select id from companies order by created_at limit 1");
ok((await ad.goto(B + `/admin/companies/${co}`)).status() === 200, "company page works");
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
