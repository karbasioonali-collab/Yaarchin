// قبل از migration ۰۰۱۵ (دیتابیس در ۰۰۱۴، مثل لیارا پیش از migrate): بازدید مهمان بدون ایندکس تازه هم ثبت شود
// (فقط کندتر)، گزارش‌ها کار کنند و هیچ صفحه‌ای خراب نشود. docs/infoyaarchin.md بخش ۴۸.
// اجرا: TEST_DB=postgres://…/yarchin_e2e_pre node tests/e2e/guest-pre.e2e.mjs
import { B, admin, done, launch, ok, psql, setS, waitFor } from "./lib.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
ok(psql("select to_regclass('product_text_drafts') is not null and to_regclass('events_anon_idx') is null") === "t", "DB is at 0014 (before 0015)");
setS("auth.enforce_permissions", false);
const { b, errs, page } = await launch();
const g = await page({ userAgent: UA });
const slug = psql("select slug from products where status='published' order by created_at limit 1");
ok((await g.goto(B + "/")).status() === 200 && (await g.goto(B + `/p/${slug}`)).status() === 200, "site pages 200");
const yid = async () => (await g.context().cookies()).find((c) => c.name === "yid")?.value;
ok(await waitFor(async () => !!(await yid())), "guest cookie");
const y = await yid();
ok(await waitFor(() => psql(`select count(*) from events where anon_id='${y}' and type in ('site_visit','product_view')`) === "2"), "guest visit recorded without the new index");
const ad = await page();
await admin(ad);
ok((await ad.goto(B + "/admin/reports?range=today")).status() === 200 && (await ad.getByTestId("kpi-split").count()) === 3, "reports page with guest split");
for (const u of ["/admin", "/admin/customers", "/admin/products"]) ok((await ad.goto(B + u)).status() === 200, `${u} 200`);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
