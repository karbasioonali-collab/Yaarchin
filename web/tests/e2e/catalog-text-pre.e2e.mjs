// قبل از migration ۰۰۱۴ (دیتابیس در ۰۰۱۳، مثل لیارا پیش از migrate): صفحه‌ی محصول کار کند، کارت «متن فارسی با AI» فقط پیام
// «بعد از migration ۰۰۱۴» نشان دهد و هیچ صفحه‌ای خراب نشود. docs/infoyaarchin.md بخش ۴۰.
// اجرا: TEST_DB=postgres://…/yarchin_e2e_pre node tests/e2e/catalog-text-pre.e2e.mjs
import { B, admin, done, launch, ok, psql, setS } from "./lib.mjs";

ok(psql("select to_regclass('raw_page_edits') is not null and to_regclass('product_text_drafts') is null") === "t", "DB is at 0013 (before 0014)");
setS("auth.enforce_permissions", false);
const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
const prod = psql("select id from products order by created_at limit 1");
const r = await ad.goto(B + `/admin/products/${prod}?aiText=confirm`);
ok(r.status() === 200, "product page 200 (even with ?aiText=confirm)");
ok((await ad.getByTestId("ai-text").innerText()).includes("بعد از اجرای migration ۰۰۱۴"), "AI text card: after migration 0014");
ok((await ad.getByRole("button", { name: "اجرا و ساخت پیش‌نویس" }).count()) === 0, "no run button");
ok((await ad.locator('[data-testid="ref-summary"]').count()) === 1, "rest of product page works");
for (const u of ["/admin", "/admin/products", "/admin/ai", "/admin/import", "/admin/categories"]) ok((await ad.goto(B + u)).status() === 200, `${u} 200`);
const slug = psql("select slug from products where status='published' order by created_at limit 1");
ok((await ad.goto(B + `/p/${slug}`)).status() === 200, "public product page 200");
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
