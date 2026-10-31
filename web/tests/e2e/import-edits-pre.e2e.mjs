// قبل از migration ۰۰۱۳ (دیتابیس در ۰۰۱۲، مثل لیارا پیش از migrate): صفحه‌ی بررسی «ورود از علی‌بابا» فقط‌خواندنی کار کند،
// پیام «بعد از migration ۰۰۱۳» نشان دهد، فرم اصلاح و ثبت نداشته باشد و چیزی خراب نشود. docs/infoyaarchin.md بخش ۳۷.
// اجرا: TEST_DB=postgres://…/yarchin_e2e_pre node tests/e2e/import-edits-pre.e2e.mjs
import { mhtml } from "./alibaba-mhtml.mjs";
import { B, admin, done, launch, ok, psql, setS } from "./lib.mjs";

ok(psql("select to_regclass('raw_pages') is not null and to_regclass('raw_page_edits') is null") === "t", "DB is at 0012 (before 0013)");
psql("delete from raw_pages");
setS("auth.enforce_permissions", false);
const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
await ad.goto(B + "/admin/import");
const buf = await mhtml("sample1");
const id = await ad.evaluate(
  async (b64) =>
    (
      await (
        await fetch("/api/admin/import/upload", {
          method: "POST",
          headers: { "x-yc-upload": "1", "x-file-name": "s1.mhtml", "content-type": "application/octet-stream" },
          body: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
        })
      ).json()
    ).id,
  buf.toString("base64"),
);
ok(!!id, "upload works before 0013");
const r = await ad.goto(B + `/admin/import/${id}`);
ok(r.status() === 200 && (await ad.getByTestId("price-tiers").locator("tbody tr").count()) === 3, "review page works (read-only)");
ok((await ad.getByText("اصلاح و ثبت بعد از اجرای migration ۰۰۱۳ فعال می‌شوند.").count()) === 1, "notice: after migration 0013");
ok((await ad.getByTestId("register").count()) === 0 && (await ad.getByText("اصلاح مقدارها").count()) === 0, "no edit/register forms");
ok((await ad.getByTestId("highlights").locator("li").count()) === 5, "parser v2 works without 0013");
ok((await ad.goto(B + "/admin/import")).status() === 200, "list page 200");
ok((await ad.goto(B + "/media-db/999999999")).status() === 404, "/media-db before 0013: unknown id 404, no crash");
for (const u of ["/admin", "/admin/products", "/admin/companies"]) ok((await ad.goto(B + u)).status() === 200, `${u} 200`);
psql("delete from raw_pages");
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
