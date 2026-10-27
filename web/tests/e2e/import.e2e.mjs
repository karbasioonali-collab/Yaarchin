// وارد کردن عکس از لینک (پنل محصول و API اکستنشن) و فرم «محصول جدید». منبع واقعی: همین ریپوی عمومی روی
// raw.githubusercontent.com و github.com (در محیط تست مجازند؛ بدون اینترنت این تست ناموفق است). محصول تستی آخر کار پاک می‌شود.
// اجرا: TEST_DB=… node tests/e2e/import.e2e.mjs — docs/infoyaarchin.md بخش ۲۷.
import { B, admin, done, expert, launch, ok, psql, setS, vis } from "./lib.mjs";

const RAW = "https://raw.githubusercontent.com/karbasioonali-collab/Yaarchin/main";
const GH = "https://github.com/karbasioonali-collab/Yaarchin/raw/main";
const T0 = psql("select now()");
const acts = (a) => Number(psql(`select count(*) from activity_log where action='${a}' and created_at > '${T0}'`));
const waitFor = async (fn, ms = 30000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return fn();
};

psql("delete from login_attempts");
setS("auth.enforce_permissions", false);
setS("media.batch_max", 20);
psql("delete from product_media where product_id in (select id from products where slug like 'import-test%')");
psql("delete from products where slug like 'import-test%'");

const { b, errs, page } = await launch();
async function login(fn) {
  const p = await page();
  await fn(p);
  return { p, cookie: (await p.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ") };
}
const { p: ad, cookie } = await login(admin);
const api = async (body, { ck = cookie, headers = {} } = {}) => {
  const r = await fetch(B + "/api/admin/media/import", {
    method: "POST",
    headers: { cookie: ck, origin: B, "x-yc-upload": "1", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  let j = {};
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};

// ---------- 1. new product form ----------
await ad.goto(B + "/admin/products/new");
ok(await vis(ad.getByText("بعد از ذخیره‌ی محصول، عکس و ویدیو را اضافه کنید")), "new product: clear photo note");
await ad.locator('input[name="titleFa"]').fill("محصول تست ورود عکس");
await ad.locator('input[name="slug"]').fill("import-test");
await ad.getByRole("button", { name: "ساخت محصول" }).click();
await ad.waitForURL(/\/admin\/products\/[0-9a-f-]{36}\?created=1#media$/);
const prod = psql("select id from products where slug='import-test'");
ok(!!prod, "product created; redirected to #media");
ok(await vis(ad.getByText("محصول ساخته شد. حالا عکس و ویدیوی آن را اینجا آپلود کنید")), "notice on product page");
const box = await ad.locator("#media").boundingBox();
ok(box && box.y >= -5 && box.y < 300, `media section scrolled into view (y=${box && Math.round(box.y)})`);
ok(await ad.getByLabel("آپلود عکس و ویدیوی محصول").isVisible(), "uploader visible right away");

// ---------- 2. import via panel ----------
await ad.getByText("+ وارد کردن عکس از لینک").click();
const urls = [
  `${RAW}/web/src/app/icon.png`,
  `${GH}/web/src/app/icon.png`, // redirect to the same file -> duplicate
  `${GH}/extension/assets/icons/icon-48.png`, // redirect -> new (icon-128 = icon.png بایت‌به‌بایت؛ بخش ۲۷)
  "http://example.com/a.jpg",
  "https://127.0.0.1/a.jpg",
  `${RAW}/README.md`,
  `${RAW}/no-such-file-xyz.png`,
];
await ad.getByLabel("لینک عکس‌ها").fill(urls.join("\n"));
await ad.getByRole("button", { name: "وارد کردن از لینک" }).click();
const items = ad.locator('ul[aria-live="polite"] li');
ok(await waitFor(async () => (await items.count()) === 7 && (await items.allInnerTexts()).every((t) => !/در صف|در حال دانلود/.test(t)), 60000), "all 7 links processed");
const res = await items.allInnerTexts();
console.log(res.map((x) => "   " + x.replace(/\n/g, " → ")).join("\n"));
ok(res[0].includes("وارد شد"), "raw link imported");
ok(res[1].includes("تکراری"), "same image via redirect: duplicate");
ok(res[2].includes("وارد شد"), "redirected link imported");
ok(res[3].includes("https"), "http link rejected");
ok(res[4].includes("داخلی"), "internal address rejected");
ok(res[5].includes("نوع فایل"), "non-image rejected");
ok(res[6].includes("۴۰۴"), "missing file: 404 reported");
ok(psql(`select count(*) from product_media where product_id='${prod}'`) === "2", "2 media rows");
ok(psql(`select bool_or(is_public) from product_media where product_id='${prod}'`) === "f", "imported images default: not public");
ok(
  psql(
    `select count(*) from media_files f join product_media m on m.storage_key=f.key where m.product_id='${prod}' and f.source='url' and f.source_url like 'https://%' and f.logo_check='unchecked' and f.mime='image/webp'`,
  ) === "2",
  "media_files: source=url, source_url, unchecked, webp",
);
ok(acts("product.media.import") === 2, "imports logged");
ok(
  psql(`select after->>'finalUrl' from activity_log where action='product.media.import' and created_at > '${T0}' order by id desc limit 1`).startsWith(
    "https://raw.githubusercontent.com/",
  ),
  "final URL after redirect logged",
);
await ad.reload();
ok((await vis(ad.getByText("منتشر نشود (بررسی کنید)"))) && (await ad.locator("a", { hasText: "از لینک" }).count()) === 2, "panel: 'from link' badge + review label");

// ---------- 3. site + publish ----------
psql(`update products set status='published', published_at=now() where id='${prod}'`);
const k = psql(`select storage_key from product_media where product_id='${prod}' order by sort_order limit 1`);
ok(!(await (await fetch(B + "/p/import-test")).text()).includes(k), "site: unreviewed import not shown");
const item = ad.locator('div[class*="mediaItem"]', { has: ad.locator(`img[src*="${k}-480.webp"]`) });
await item.getByRole("button", { name: "انتشار" }).click();
ok(await waitFor(() => psql(`select is_public from product_media where storage_key='${k}'`) === "t"), "admin publishes after review");
ok(await waitFor(async () => (await (await fetch(B + "/p/import-test")).text()).includes(`${k}-1000.webp`)), "site shows it after publish");

// ---------- 4. API ----------
let r = await api({ productId: prod, url: `${RAW}/web/src/app/icon.png` });
ok(r.s === 200 && r.j.status === "duplicate", "API re-import: duplicate (safe for extension retries)");
r = await api({ productId: prod, url: `${RAW}/web/src/app/icon.png` }, { headers: { "x-yc-upload": "" } });
ok(r.s === 403, "no custom header: 403");
r = await api({ productId: prod, url: `${RAW}/web/src/app/icon.png` }, { headers: { origin: "https://evil.example" } });
ok(r.s === 403, "foreign origin: 403");
r = await api({ productId: prod, url: `${RAW}/web/src/app/icon.png` }, { ck: "" });
ok(r.s === 401, "not logged in: 401");
r = await api({ productId: "x", url: `${RAW}/web/src/app/icon.png` });
ok(r.s === 400, "bad product: 400");
const otherListing = psql(`select id from product_listings where product_id<>'${prod}' limit 1`);
r = await api({ productId: prod, url: `${RAW}/extension/assets/icons/icon-48.png`, listingId: otherListing });
ok(r.s === 400 && r.j.error.includes("لیستینگ"), "listing of another product: 400");
r = await api({ productId: prod, url: "https://[::ffff:127.0.0.1]/x.png" });
ok(r.s === 422 && r.j.error.includes("داخلی"), "obfuscated loopback: rejected");
const expertRole = psql("select id from roles where key='expert'");
const saved = psql(`select coalesce(string_agg(permission_key, ','), '') from role_permissions where role_id='${expertRole}'`);
psql(`delete from role_permissions where role_id='${expertRole}'`);
psql("update settings set value='true' where key='auth.enforce_permissions'");
const { cookie: ex } = await login(expert);
r = await api({ productId: prod, url: `${RAW}/extension/assets/icons/icon-48.png` }, { ck: ex });
ok(r.s === 403, "expert without products.manage: 403");
if (saved) for (const p of saved.split(",")) psql(`insert into role_permissions (role_id, permission_key) values ('${expertRole}', '${p}')`);
psql("update settings set value='false' where key='auth.enforce_permissions'");

// cleanup (کاتالوگ و صفحه‌ی اصلی بعدی تحت تأثیر نباشند)
psql(`delete from product_media where product_id='${prod}'`);
psql(`delete from products where id='${prod}'`);
psql(`delete from media_files where created_at > '${T0}'`);
console.log("page errors:", errs.length ? errs : "none");
ok(!errs.length, "no JS page errors");
await b.close();
done();
process.exit();
