// آپلود عکس و ویدیو (پنل): چند فایل با نوار پیشرفت، حذف EXIF و چرخش، سه اندازه‌ی WebP، «لوگوی کارخانه — منتشر نشود»، عکس اصلی،
// حذف فایل از storage، ویدیو با Range و پیش‌نمایش، ردّ نوع‌های خطرناک و بزرگ، امنیت API (هدر، origin، ورود، دسترسی)، سقف فضای حالت آزمایشی،
// سقف تعداد، عکس دسته و اسلایدر. سرور باید در «حالت آزمایشی» ذخیره روی دیسک باشد (بدون S3_*). فایل‌ها و ردیف‌های تستی آخر کار پاک می‌شوند.
// اجرا: TEST_DB=… node tests/e2e/media.e2e.mjs — docs/infoyaarchin.md بخش ۲۶.
import fs from "node:fs";
import { B, admin, done, expert, launch, ok, psql, setS, vis, waitFor } from "./lib.mjs";
import { makeFixtures, sharp } from "./fixtures.mjs";

// پوشه‌ی ذخیره‌ی حالت آزمایشی سرور standalone (serve.sh از .next/standalone اجرا می‌کند ← .data/media)
const DIR = process.env.MEDIA_DIR ?? new URL("../../.next/standalone/.data/media", import.meta.url).pathname;
const fx = await makeFixtures();
const FX = fx.dir;
const acts = (a) => Number(psql(`select count(*) from activity_log where action='${a}' and created_at > '${T0}'`));
const files = (key) => ["480", "1000", "1800"].map((w) => `${DIR}/${key}-${w}.webp`);

// ---------- آماده‌سازی ----------
const T0 = psql("select now()");
psql("delete from login_attempts");
setS("auth.enforce_permissions", false);
for (const [k, v] of [
  ["media.image_max_mb", 15],
  ["media.batch_max", 20],
  ["media.video_max_mb", 50],
  ["media.test_total_mb", 150],
  ["media.test_video_max_mb", 20],
])
  setS(k, v);
const prod = psql("select id from products where slug='portable-blender'");
psql(`delete from product_media where product_id='${prod}' and (storage_key like 'img/%' or storage_key like 'vid/%')`);
psql("delete from media_files");
fs.rmSync(DIR, { recursive: true, force: true });

const { b, errs, page } = await launch();
async function login(fn) {
  const p = await page();
  await fn(p);
  const cookie = (await p.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  return { p, cookie };
}
const { p: ad, cookie } = await login(admin);
async function api(q, file, { headers = {}, ck = cookie, type = "application/octet-stream" } = {}) {
  const r = await fetch(`${B}/api/admin/media/upload?${q}`, {
    method: "POST",
    headers: { cookie: ck, origin: B, "x-yc-upload": "1", "content-type": type, ...headers },
    body: fs.readFileSync(`${FX}/${file}`),
  });
  let j = {};
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
}

// ---------- 1. product: multi upload ----------
await ad.goto(B + `/admin/products/${prod}`);
ok(await vis(ad.getByText("حالت آزمایشی آپلود")), "test-mode note on product page");
ok((await ad.getByLabel("عکس با دوربین", { exact: true }).getAttribute("capture")) === "environment", "camera input present (phone)");
const before = Number(psql(`select count(*) from product_media where product_id='${prod}'`));
await ad.getByLabel("آپلود عکس و ویدیوی محصول").setInputFiles([`${FX}/photo.jpg`, `${FX}/photo2.png`, `${FX}/photo3.webp`]);
ok(await waitFor(async () => (await ad.getByText("✓ ذخیره شد").count()) === 3), "3 images uploaded (progress list)");
const rows = psql(`select storage_key from product_media where product_id='${prod}' and storage_key like 'img/%' order by sort_order`).split("\n").filter(Boolean);
ok(rows.length === 3 && Number(psql(`select count(*) from product_media where product_id='${prod}'`)) === before + 3, "3 product_media rows appended");
ok(
  psql("select count(*) from media_files where storage='local' and kind='image' and mime='image/webp' and source='upload' and purpose='product' and logo_check='unchecked'") ===
    "3",
  "media_files rows (local, webp, unchecked)",
);
ok(rows.every((k) => /^img\/\d{4}\/\d{2}\/[a-z0-9]{24}$/.test(k)) && rows.every((k) => files(k).every((f) => fs.existsSync(f))), "3 sizes on disk per image");
ok(acts("product.media.upload") === 3, "uploads logged");
ok(await waitFor(async () => (await ad.locator(`img[src*="${rows[0]}-480.webp"]`).count()) > 0), "panel shows new thumbnail (refresh)");
// EXIF / orientation / sizes
const k0 = psql(`select key from media_files where original_name='photo.jpg'`);
const lg = await sharp(`${DIR}/${k0}-1800.webp`).metadata(),
  sm = await sharp(`${DIR}/${k0}-480.webp`).metadata();
ok(lg.format === "webp" && !lg.exif && !lg.icc && !lg.xmp && !lg.orientation, "EXIF/metadata stripped");
ok(!fs.readFileSync(`${DIR}/${k0}-1800.webp`).toString("latin1").includes("SECRET"), "no EXIF text in file bytes");
ok(lg.width === 1600 && lg.height === 2400, `orientation applied, no upscale (${lg.width}x${lg.height})`);
ok(sm.width === 480, "small size 480px");
ok(psql(`select width||'x'||height from media_files where key='${k0}'`) === "1600x2400", "dimensions stored");

// ---------- 2. logo flag ----------
await ad.getByLabel("دارای لوگوی کارخانه — منتشر نشود").first().check();
await ad.getByLabel("آپلود عکس و ویدیوی محصول").setInputFiles([`${FX}/logo.jpg`]);
ok(await waitFor(async () => (await ad.getByText("✓ ذخیره شد").count()) === 1), "logo image uploaded");
const logoKey = psql(`select key from media_files where original_name='logo.jpg'`);
ok(psql(`select is_public from product_media where storage_key='${logoKey}'`) === "f", "logo image: not public");
await ad.getByLabel("دارای لوگوی کارخانه — منتشر نشود").first().uncheck();

// ---------- 3. site ----------
const site = await (await fetch(B + "/p/portable-blender")).text();
ok(site.includes(`${rows[0]}-1000.webp`) || site.includes(`${rows[1]}-1000.webp`), "site: page size (1000) used");
ok(site.includes("-480.webp"), "site: thumbnails 480");
ok(!site.includes(logoKey), "site: logo image never shown");
const fileRes = await fetch(`${B}/files/${rows[0]}-1000.webp`);
ok(
  fileRes.status === 200 && fileRes.headers.get("content-type") === "image/webp" && fileRes.headers.get("x-content-type-options") === "nosniff",
  "/files serves webp with nosniff",
);
ok((await fetch(`${B}/files/..%2F..%2Fetc%2Fpasswd`)).status === 404 && (await fetch(`${B}/files/img/2026/10/abc.webp`)).status === 404, "/files rejects arbitrary paths");

// ---------- 4. main image ----------
await ad.reload();
const third = ad.locator('div[class*="mediaItem"]', { has: ad.locator(`img[src*="${rows[2]}-480.webp"]`) });
await third.getByRole("button", { name: "عکس اصلی" }).click();
ok(await waitFor(() => psql(`select storage_key from product_media where product_id='${prod}' order by sort_order limit 1`) === rows[2]), "main image moved to first");
ok(acts("product.media.main") === 1, "main logged");
ok(
  (await (await fetch(B + "/")).text()).includes(`${rows[2]}-480.webp`) ||
    (await (await fetch(B + "/c/" + psql(`select c.slug from categories c join products p on p.category_id=c.id where p.id='${prod}'`))).text()).includes(`${rows[2]}-480.webp`),
  "site card cover = new main (480)",
);

// ---------- 5. delete removes files ----------
await ad.reload();
const second = ad.locator('div[class*="mediaItem"]', { has: ad.locator(`img[src*="${rows[1]}-480.webp"]`) });
await second.getByRole("button", { name: "حذف" }).click();
ok(await waitFor(() => psql(`select count(*) from product_media where storage_key='${rows[1]}'`) === "0"), "media row deleted");
ok(await waitFor(() => files(rows[1]).every((f) => !fs.existsSync(f))), "files removed from storage");
ok(psql(`select count(*) from media_files where key='${rows[1]}'`) === "0" && acts("media.delete") === 1 && acts("product.media.delete") === 1, "media_files row gone + logged");
const miss = await fetch(`${B}/files/${rows[1]}-480.webp`);
ok(miss.status === 404 && miss.headers.get("content-type") === "image/svg+xml" && (await miss.text()).includes("فایل آزمایشی پاک شده"), "missing test file: placeholder image");

// ---------- 6. video ----------
await ad.getByLabel("آپلود عکس و ویدیوی محصول").setInputFiles([`${FX}/clip.mp4`]);
ok(await waitFor(async () => (await ad.getByText("✓ ذخیره شد").count()) === 1), "video uploaded");
const vid = psql(`select key from media_files where kind='video'`);
ok(/^vid\/\d{4}\/\d{2}\/[a-z0-9]{24}\.mp4$/.test(vid) && psql(`select kind from product_media where storage_key='${vid}'`) === "video", "video row + key");
const rg = await fetch(`${B}/files/${vid}`, { headers: { range: "bytes=0-99" } });
ok(rg.status === 206 && rg.headers.get("content-range")?.startsWith("bytes 0-99/") && (await rg.arrayBuffer()).byteLength === 100, "video Range request (206)");
let r = await api(`purpose=product&productId=${prod}`, "big.mp4", { type: "video/mp4" });
ok(r.s === 413 && /۲۰|20/.test(r.j.error), `test-mode video cap 20MB (${r.s} ${r.j.error})`);
// poster
await ad.reload();
const vItem = ad.locator('div[class*="mediaItem"]', { hasText: "ویدیو" }).last();
await vItem.locator("summary", { hasText: "عکس پیش‌نمایش" }).click();
await vItem.getByLabel("آپلود عکس پیش‌نمایش").setInputFiles(`${FX}/photo2.png`);
ok(await vis(vItem.getByText("آپلود شد")), "poster uploaded");
await vItem.getByRole("button", { name: "ذخیره" }).click();
ok(await waitFor(() => /^img\//.test(psql(`select coalesce(poster_key,'') from product_media where storage_key='${vid}'`))), "poster saved");
ok(acts("product.media.poster") === 1 && acts("media.upload") >= 1, "poster logged");

// ---------- 7. rejections ----------
const want = [
  ["evil.svg", 415, "SVG"],
  ["fake.heic", 415, "HEIC"],
  ["clip.mov", 415, "MOV"],
  ["corrupt.jpg", 422, "خراب"],
  ["big.jpg", 413, "حداکثر"],
];
for (const [f, s, txt] of want) {
  r = await api(`purpose=product&productId=${prod}`, f);
  ok(r.s === s && r.j.error?.includes(txt), `reject ${f}: ${r.s} ${r.j.error}`);
}
r = await api("purpose=category", "clip.mp4", { type: "video/mp4" });
ok(r.s === 415 && r.j.error.includes("فقط عکس"), "category: video rejected");
r = await api("purpose=product&productId=" + prod, "photo2.png", { headers: { "x-yc-upload": "" } });
ok(r.s === 403, "no custom header: 403");
r = await api("purpose=product&productId=" + prod, "photo2.png", { headers: { origin: "https://evil.example" } });
ok(r.s === 403, "foreign origin: 403");
r = await api("purpose=product&productId=" + prod, "photo2.png", { ck: "" });
ok(r.s === 401, "not logged in: 401");
r = await api("purpose=avatar", "photo2.png");
ok(r.s === 400, "bad purpose: 400");
// permissions
const expertRole = psql("select id from roles where key='expert'");
const saved = psql(`select coalesce(string_agg(permission_key, ','), '') from role_permissions where role_id='${expertRole}'`);
psql(`delete from role_permissions where role_id='${expertRole}'`);
psql("update settings set value='true' where key='auth.enforce_permissions'");
const { cookie: exCookie } = await login(expert);
r = await api("purpose=product&productId=" + prod, "photo2.png", { ck: exCookie });
ok(r.s === 403, "expert without products.manage: 403");
psql(`insert into role_permissions (role_id, permission_key) values ('${expertRole}', 'site.manage')`);
r = await api("purpose=slide", "photo2.png", { ck: exCookie });
ok(r.s === 200 && r.j.ok, "expert with site.manage: slide upload ok");
r = await api("purpose=category", "photo2.png", { ck: exCookie });
ok(r.s === 403, "expert with site.manage: category 403");
psql(`delete from role_permissions where role_id='${expertRole}'`);
if (saved) for (const k of saved.split(",")) psql(`insert into role_permissions (role_id, permission_key) values ('${expertRole}', '${k}')`);
psql("update settings set value='false' where key='auth.enforce_permissions'");

// ---------- 8. test-space cap ----------
setS("media.test_total_mb", 10);
fs.mkdirSync(`${DIR}/pad`, { recursive: true });
fs.writeFileSync(`${DIR}/pad/fill.bin`, Buffer.alloc(10 * 1024 * 1024));
r = await api("purpose=product&productId=" + prod, "photo2.png");
ok(r.s === 507 && r.j.error.includes("فضای حالت آزمایشی پر است"), `test space full: clear message (${r.j.error})`);
fs.rmSync(`${DIR}/pad`, { recursive: true });
setS("media.test_total_mb", 150);
// batch max
setS("media.batch_max", 2);
await ad.reload();
await ad.getByLabel("آپلود عکس و ویدیوی محصول").setInputFiles([`${FX}/photo.jpg`, `${FX}/photo2.png`, `${FX}/photo3.webp`]);
ok(await vis(ad.getByText(/حداکثر ۲ فایل در هر بار/)), "batch max: message");
ok(await waitFor(async () => (await ad.getByText("✓ ذخیره شد").count()) === 2), "batch max: only 2 uploaded");
setS("media.batch_max", 20);

// ---------- 9. category ----------
const cat = psql("select id from categories where status='active' and parent_id is null order by sort_order limit 1");
const origCatImage = psql(`select coalesce(image,'') from categories where id='${cat}'`);
await ad.goto(B + `/admin/categories/${cat}`);
ok(await vis(ad.getByText("حالت آزمایشی آپلود")), "category: test-mode note");
await ad.getByLabel("آپلود یا عکس دلخواه").setInputFiles(`${FX}/cat.jpg`);
ok(await vis(ad.getByText("آپلود شد")), "category image uploaded");
const catKey = await ad.locator('input[name="image"]').inputValue();
ok(/^img\//.test(catKey), "field filled with storage key");
await ad.getByRole("button", { name: "ذخیره", exact: true }).click();
ok(await waitFor(() => psql(`select image from categories where id='${cat}'`) === catKey), "category saved with uploaded image");
ok((await (await fetch(B + "/")).text()).includes(`${catKey}-480.webp`), "site: category box uses 480");

// ---------- 10. slider ----------
await ad.goto(B + "/admin/site/slider");
await ad.getByLabel("آپلود عکس").first().setInputFiles(`${FX}/slide.jpg`);
ok(await vis(ad.getByText("آپلود شد")), "slide image uploaded");
const slideKey = await ad.locator('input[name="slides.0.image"]').inputValue();
await ad.getByRole("button", { name: "ذخیره", exact: true }).click();
ok(await waitFor(async () => (await (await fetch(B + "/")).text()).includes(`${slideKey}-1800.webp`)), "site: slider uses 1800");

// ---------- 11. misc ----------
await ad.goto(B + "/admin/settings");
ok((await vis(ad.getByText("آپلود عکس و ویدیو"))) && (await ad.getByText("حداکثر حجم ویدیو در حالت آزمایشی").count()) === 1, "settings page: media group");
ok(psql("select count(*) from media_files where source<>'upload' or sha256 !~ '^[0-9a-f]{64}$'") === "0", "sha256 stored for every file");
// ---------- برگشت ----------
psql(`update categories set image=${origCatImage ? `'${origCatImage}'` : "null"} where id='${cat}'`);
psql("delete from site_blocks where key='home.slider'");
psql(`delete from product_media where product_id='${prod}' and (storage_key like 'img/%' or storage_key like 'vid/%')`);
psql("delete from media_files");
fs.rmSync(DIR, { recursive: true, force: true });
fx.cleanup();
console.log("page errors:", errs.length ? errs : "none");
ok(!errs.length, "no JS page errors");
await b.close();
done();
process.exit();
