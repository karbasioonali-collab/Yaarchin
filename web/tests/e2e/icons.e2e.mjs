// آیکون‌های دسته‌بندی و آیکون سایت: همه‌ی فایل‌های SVG آماده سرو می‌شوند، انتخاب آیکون برای دسته در پنل و نمایشش در سایت،
// اولویت «آدرس عکس» بر آیکون. دسته‌ی تغییرکرده آخر کار به حالت اول برمی‌گردد. اجرا: TEST_DB=… node tests/e2e/icons.e2e.mjs — docs/infoyaarchin.md بخش ۲۰.
import { readFileSync } from "node:fs";
import { B, admin, done, launch, ok, psql, waitFor } from "./lib.mjs";

const src = readFileSync(new URL("../../src/lib/catalog/category-icons.ts", import.meta.url), "utf8");
const keys = [...src.matchAll(/key: "([a-z-]+)"/g)].map((m) => m[1]);
ok(keys.length >= 22, `CATEGORY_ICONS has ${keys.length} icons`);
// هر SVG شناسه‌های داخلی خودش را دارد (تداخل id بین آیکون‌ها ← گرادیان اشتباه؛ بخش ۱۶)
const bad = [];
const seen = new Map();
for (const k of keys) {
  const r = await fetch(B + `/media/icons/categories/${k}.svg`);
  const t = await r.text();
  if (r.status !== 200 || !/svg/.test(r.headers.get("content-type") ?? "")) bad.push(k);
  for (const [, idv] of t.matchAll(/id="([^"]+)"/g)) {
    if (seen.has(idv) && seen.get(idv) !== k) bad.push(`${k}:${idv}`);
    seen.set(idv, k);
  }
}
ok(!bad.length, `every icon served as SVG, internal ids unique across icons (${bad.join(",") || "ok"})`);
const icon = await fetch(B + "/icon.png");
ok(icon.status === 200 && (icon.headers.get("content-type") ?? "").includes("png"), "site icon /icon.png");

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
const site = await page();
const cat = psql("select id || '|' || slug || '|' || coalesce(image,'') from categories where parent_id is null and status='active' order by sort_order, slug limit 1").split("|");
const [id, slug, origImage] = cat;

// انتخاب آیکون (آدرس عکس خالی)
await ad.goto(B + `/admin/categories/${id}`);
await ad.locator('input[name="image"]').fill("");
await ad.locator('input[name="icon"][value="toys"]').check();
await ad.getByRole("button", { name: "ذخیره" }).click();
ok(await waitFor(() => psql(`select image from categories where id='${id}'`) === "/media/icons/categories/toys.svg"), "icon saved as internal path");
await site.goto(B + "/");
ok((await site.locator(`a[href="/c/${slug}"] img[src*="/media/icons/categories/toys.svg"]`).count()) >= 1, "home category box shows chosen icon");
await ad.goto(B + "/admin/categories");
ok((await ad.locator('img[src*="/media/icons/categories/toys.svg"]').count()) >= 1, "admin category list shows icon thumbnail");
await ad.goto(B + `/admin/categories/${id}`);
ok(await ad.locator('input[name="icon"][value="toys"]').isChecked(), "edit form: current icon preselected");

// آدرس عکس بر آیکون اولویت دارد
await ad.locator('input[name="image"]').fill("https://example.com/category-test.png");
await ad.locator('input[name="icon"][value="toys"]').check();
await ad.getByRole("button", { name: "ذخیره" }).click();
ok(await waitFor(() => psql(`select image from categories where id='${id}'`) === "https://example.com/category-test.png"), "image URL wins over icon");

// برگشت (عکس demo یک کلید storage است که از فرم قابل ثبت نیست؛ مستقیم در دیتابیس)
psql(`update categories set image=${origImage ? `'${origImage}'` : "null"} where id='${id}'`);
await site.goto(B + "/");
ok((await site.locator(`main a[href="/c/${slug}"] img[src*="/media/icons/categories/toys"]`).count()) === 0, "category restored (no test icon on home)");
console.log("page errors:", errs.length ? errs : "none");
ok(!errs.length, "no JS page errors");
await b.close();
done();
process.exit();
