// بخش ۵۵: ویدیو محصول با لینک آپارات (بدون migration؛ seed: سوئیچ media.video_upload). سرور با MOCK_ENV run-all
// (APARAT_OEMBED_BASE=http://127.0.0.1:3399 و APARAT_CHECK_CACHE_MS=0)؛ این تست خودش tests/e2e/mock-ai.mjs را بالا می‌آورد.
// اجرا: TEST_DB=postgres://…/yarchin_e2e node tests/e2e/aparat.e2e.mjs
import { spawn } from "node:child_process";
import { B, admin, done, launch, ok, psql, setS, sleep, vis, waitFor } from "./lib.mjs";

setS("auth.enforce_permissions", false);
setS("media.video_upload", false);
const SLUG = "portable-blender";
const prod = psql(`select id from products where slug='${SLUG}'`);
psql(`delete from product_media where product_id='${prod}' and (storage_key like 'aparat:%' or storage_key like 'vid/%')`);
const EMBED = (h) => `https://www.aparat.com/video/video/embed/videohash/${h}/vt/frame?recom=self`;
const row = () => psql(`select storage_key || '|' || coalesce(poster_key, '-') || '|' || is_public from product_media where product_id='${prod}' and storage_key like 'aparat:%'`);

const mock = spawn(process.execPath, [new URL("./mock-ai.mjs", import.meta.url).pathname, "3399"], { stdio: ["ignore", "ignore", "inherit"] });
process.on("exit", () => mock.kill());
await sleep(500);

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
const box = () => ad.getByTestId("aparat-box");
const save = async (link) => {
  await ad.goto(B + `/admin/products/${prod}`);
  await box().getByLabel("لینک ویدیو آپارات").fill(link);
  await box()
    .getByRole("button", { name: /^ذخیره/ })
    .click();
  await waitFor(async () => (await box().locator('[role="alert"], [role="status"]').count()) > 0, 10000);
  return (await box().locator('[role="alert"], [role="status"]').first().innerText()).trim();
};

// ---------- پنل: آپلود ویدیو پنهان، خانه‌ی آپارات ----------
await ad.goto(B + `/admin/products/${prod}`);
ok(await vis(box()), "aparat box on the product edit page");
ok((await ad.getByLabel("آپلود عکس و ویدیوی محصول").count()) === 0 && (await ad.getByLabel("آپلود عکس محصول").count()) === 1, "switch off: video file upload hidden");
ok(!(await ad.getByLabel("آپلود عکس محصول").getAttribute("accept")).includes("video"), "file picker accepts images only");
const up = await ad.evaluate(
  async ([pid]) => {
    const blob = await (await fetch("/media/demo/products/portable-blender.webm")).blob();
    const r = await fetch(`/api/admin/media/upload?purpose=product&productId=${pid}`, { method: "POST", headers: { "x-yc-upload": "1", "x-file-name": "v.webm" }, body: blob });
    return { s: r.status, j: await r.json().catch(() => ({})) };
  },
  [prod],
);
ok(up.s === 415 && /لینک آپارات/.test(up.j.error ?? ""), `server rejects a video upload while the switch is off (${up.s} ${up.j.error})`);

// ---------- لینک غلط ← خطای فارسی، چیزی ذخیره نمی‌شود ----------
let msg = await save("https://www.youtube.com/watch?v=abc12");
ok(msg.includes("فقط لینک ویدیوی آپارات") && row() === "", `other site rejected (${msg})`);
msg = await save("https://www.aparat.com/yarchin");
ok(msg.includes("صفحه‌ی یک ویدیو نیست") && row() === "", "channel page rejected");

// ---------- ذخیره با oEmbed ----------
msg = await save("aparat.com/v/abc12/مخلوط-کن-قابل-حمل?playlist=1");
ok(msg.includes("ویدیو آپارات ذخیره شد") && msg.includes("عکس پیش‌نمایش از آپارات گرفته شد"), `saved (${msg})`);
ok(row() === "aparat:abc12|https://static.cdn.asset.aparat.com/avt/abc12-thumb.jpg|true", `stored as aparat:<code> + oEmbed poster (${row()})`);
ok(psql(`select count(*) from activity_log where action='product.media.aparat' and entity_id='${prod}'`) !== "0", "activity logged");
await ad.goto(B + `/admin/products/${prod}`);
ok((await ad.getByTestId("aparat-current").innerText()).includes("https://www.aparat.com/v/abc12"), "current video shown with its link");
ok((await box().getByLabel("لینک ویدیو آپارات").inputValue()) === "https://www.aparat.com/v/abc12", "field prefilled with the clean link");

// ---------- سایت: اسلاید دوم، پخش فقط بعد از کلیک ----------
const site = await page();
await site.goto(B + `/p/${SLUG}`);
const kinds = await site.locator('[role="tablist"] [role="tab"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
ok(kinds[1] === "aparat" && kinds.filter((k) => k === "aparat").length === 1, `aparat is the 2nd slide (${kinds.join(",")})`);
ok(kinds.includes("video"), "demo video untouched");
ok((await site.locator("iframe").count()) === 0, "no iframe before choosing the video");
await site.locator('[role="tablist"] [role="tab"]').nth(1).click();
ok(await vis(site.getByTestId("aparat-poster")), "poster with play icon");
ok((await site.getByTestId("aparat-poster").locator("img").getAttribute("src")) === "https://static.cdn.asset.aparat.com/avt/abc12-thumb.jpg", "poster from oEmbed");
ok((await site.locator("iframe").count()) === 0, "still no iframe before the click (page stays fast)");
await site.getByTestId("aparat-poster").click();
const fr = site.getByTestId("aparat-player").locator("iframe");
ok((await fr.getAttribute("src")) === EMBED("abc12"), "iframe after the click, embed URL with recom=self");
ok(
  (await fr.getAttribute("sandbox")) === "allow-scripts allow-same-origin allow-presentation" && (await fr.getAttribute("allowfullscreen")) !== null,
  "minimal sandbox, fullscreen allowed",
);
ok(site.url().endsWith(`/p/${SLUG}`), "customer stays on the product page");
// lightbox
await site.getByRole("button", { name: "نمایش تمام‌صفحه" }).click();
const dlg = site.locator("dialog");
ok(await vis(dlg.getByTestId("aparat-poster")), "lightbox: poster");
await dlg.getByTestId("aparat-poster").click();
ok((await dlg.locator("iframe").getAttribute("src")) === EMBED("abc12"), "lightbox: plays after the click");
await dlg.getByRole("button", { name: "بستن" }).click();

// ---------- عوض کردن لینک؛ oEmbed در دسترس نیست ← ذخیره می‌شود، پیش‌نمایش ساده ----------
msg = await save("https://www.aparat.com/v/noemb12");
ok(msg.includes("لینک ویدیو عوض شد") && msg.includes("پیش‌نمایش ساده"), `oEmbed failure does not block saving (${msg})`);
ok(row() === "aparat:noemb12|-|true", `replaced, one row, no poster (${row()})`);
msg = await save("https://www.aparat.com/v/noemb12");
ok(msg.includes("همین ویدیو از قبل ذخیره شده"), "same link → no change");
await site.goto(B + `/p/${SLUG}`);
await site.locator('[role="tablist"] [role="tab"]').nth(1).click();
ok((await site.getByTestId("aparat-poster").locator("img").count()) === 0 && (await site.getByTestId("aparat-poster").isVisible()), "simple default preview with play icon");

// ---------- حذف یا خصوصی در آپارات ← در سایت نیست، در پنل برچسب ----------
await save("https://www.aparat.com/v/abc12");
psql(`update product_media set storage_key='aparat:gone99' where product_id='${prod}' and storage_key like 'aparat:%'`);
await site.goto(B + `/p/${SLUG}`);
const k2 = await site.locator('[role="tablist"] [role="tab"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
ok(!k2.includes("aparat") && (await site.getByRole("heading", { level: 1 }).count()) === 1, `deleted/private video hidden, page fine (${k2.join(",")})`);
await ad.goto(B + `/admin/products/${prod}`);
ok(await vis(ad.getByTestId("aparat-missing")), "panel: «در آپارات پیدا نشد»");

// ---------- حذف ----------
await ad.getByTestId("aparat-box").getByRole("button", { name: "حذف ویدیو آپارات" }).click();
ok(await waitFor(() => row() === "", 10000), "removed");
ok(psql(`select count(*) from activity_log where action='product.media.aparat_remove' and entity_id='${prod}'`) !== "0", "removal logged");

// ---------- ویدیوی آپلودی که فایلش نیست ----------
psql(`insert into product_media (product_id, kind, storage_key, is_public, sort_order) values ('${prod}', 'video', 'vid/2026/01/lostfilelostfilelostfile.mp4', true, 1)`);
await ad.goto(B + `/admin/products/${prod}`);
ok(await vis(ad.getByTestId("media-lost")), "panel: «فایل در دسترس نیست»");
await site.goto(B + `/p/${SLUG}`);
const k3 = await site.locator('[role="tablist"] [role="tab"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
ok(k3.filter((k) => k === "video").length === 1, `lost upload not shown on the site; demo video still there (${k3.join(",")})`);
psql(`delete from product_media where storage_key='vid/2026/01/lostfilelostfilelostfile.mp4'`);

// ---------- موبایل ۳۶۰ ----------
await save("https://www.aparat.com/v/abc12");
const m = await page({ viewport: { width: 360, height: 760 } });
await m.goto(B + `/p/${SLUG}`);
await m.locator('[role="tablist"] [role="tab"]').nth(1).click();
await m.getByTestId("aparat-poster").click();
const w = await m.getByTestId("aparat-player").evaluate((e) => e.getBoundingClientRect().width);
ok((await m.evaluate(() => document.documentElement.scrollWidth)) <= 362 && w <= 360 && w > 250, `mobile: player fits (${Math.round(w)} px)`);
psql(`delete from product_media where product_id='${prod}' and storage_key like 'aparat:%'`);

await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
