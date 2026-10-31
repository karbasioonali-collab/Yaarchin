// ورود از صفحه‌ی ذخیره‌شده‌ی علی‌بابا (migration ۰۰۱۲): آپلود، صفحه‌ی بررسی، تکراری، رد و بازگرداندن، خواندن دوباره، سقف حجم،
// آپلود هم‌زمان، هشدار حجم عکس‌ها و دسترسی‌ها (catalog.import، companies.links، products.publish). docs/infoyaarchin.md بخش ۳۶.
// فایل MHTML واقعی در ریپو نیست: از نمونه‌های ناشناس tests/fixtures/alibaba و عکس‌های PNG ساختگی همین‌جا ساخته می‌شود.
// اجرا: TEST_DB=postgres://…/yarchin_e2e node tests/e2e/alibaba-import.e2e.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { B, admin, done, expert, launch, ok, psql, setS, sleep, vis, waitFor } from "./lib.mjs";

const sharp = createRequire(new URL("../../package.json", import.meta.url))("sharp");
const FX = new URL("../fixtures/alibaba/", import.meta.url);
const run = Date.now().toString(36);

// ---------- ساخت MHTML ساختگی ----------
// quoted-printable مثل کروم: «=» و بایت‌های غیر ASCII ← =XX، خط‌های حداکثر ۷۶ با «=» آخر خط
function qp(buf) {
  const out = [];
  let line = "";
  for (const b of buf) {
    const t = b === 0x0a ? "\n" : b === 0x3d || b > 126 || (b < 32 && b !== 9 && b !== 0x0a) ? "=" + b.toString(16).toUpperCase().padStart(2, "0") : String.fromCharCode(b);
    if (t === "\n") {
      out.push(line + "\r");
      line = "";
      continue;
    }
    if (line.length + t.length > 75) {
      out.push(line + "=\r");
      line = "";
    }
    line += t;
  }
  out.push(line);
  return out.join("\n");
}
async function mhtml(name, { extra = "" } = {}) {
  const html = readFileSync(new URL(`${name}.html`, FX), "utf8").replace("</body>", `${extra}</body>`);
  const { url } = JSON.parse(readFileSync(new URL(`${name}.resources.json`, FX), "utf8"));
  const exp = JSON.parse(readFileSync(new URL(`${name}.expected.json`, FX), "utf8"));
  const B0 = "----MultipartBoundary--e2e" + run + "----";
  const parts = [
    `From: <Saved by Blink>\r\nSnapshot-Content-Location: ${url}\r\nSubject: test\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n\ttype="text/html";\r\n\tboundary="${B0}"\r\n\r\n`,
    `--${B0}\r\nContent-Type: text/html\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Location: ${url}\r\n\r\n${qp(Buffer.from(html, "utf8"))}\r\n`,
    `--${B0}\r\nContent-Type: text/css\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Location: cid:css-1@mhtml.blink\r\n\r\nbody{color:red}\r\n`,
  ];
  let i = 0;
  for (const img of exp.images) {
    if (!img.embedded) continue;
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: (i * 40) % 256, g: 120, b: 200 } } })
      .png()
      .toBuffer();
    parts.push(
      `--${B0}\r\nContent-Type: image/avif\r\nContent-Transfer-Encoding: base64\r\nContent-Location: ${img.url}\r\n\r\n${png.toString("base64").replace(/(.{76})/g, "$1\r\n")}\r\n`,
    );
    i++;
  }
  parts.push(`--${B0}--\r\n`);
  return Buffer.from(parts.join(""), "latin1");
}

psql("delete from raw_pages; delete from listing_external_ids");
psql("delete from company_external_ids where external_id in ('supplier-a', 'supplier-b')");
setS("auth.enforce_permissions", false);
const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);

// درخواست از داخل صفحه (کوکی نشست secure است و APIRequestContext پلی‌رایت آن را روی http نمی‌فرستد)
// body: base64 فایل، یا {zeros: n} برای فایل بزرگ ساخته‌شده در خود مرورگر
const post = (p, body, { name = "f.mhtml", header = true } = {}) =>
  p.evaluate(
    async ([b64, zeros, n, h]) => {
      const data = zeros ? new Uint8Array(zeros).fill(65) : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const r = await fetch("/api/admin/import/upload", {
        method: "POST",
        headers: { ...(h ? { "x-yc-upload": "1" } : {}), "x-file-name": n, "content-type": "application/octet-stream" },
        body: data,
      });
      let j = null;
      try {
        j = await r.json();
      } catch {}
      return { s: r.status, j };
    },
    [Buffer.isBuffer(body) ? body.toString("base64") : "", body.zeros ?? 0, name, header],
  );
const getStatus = (p, url) =>
  p.evaluate(async (u) => {
    const r = await fetch(u);
    return { s: r.status, type: r.headers.get("content-type"), nosniff: r.headers.get("x-content-type-options") };
  }, url);
const upload = async (p, name, buf) => {
  await p.goto(B + "/admin/import");
  await p.locator('input[type="file"]').setInputFiles({ name, mimeType: "multipart/related", buffer: buf });
};
const idOf = (p) => p.url().split("/").pop();

// ---------- صفحه، راهنما و آپلود ----------
const S1 = await mhtml("sample1");
let id1;
{
  await ad.goto(B + "/admin/import");
  const guide = await ad.getByTestId("import-guide").innerText();
  ok(/اسکرول/.test(guide) && /Attributes/.test(guide) && /Webpage, Single File/.test(guide), "upload guide: scroll, open specs tab, «Webpage, Single File»");
  ok(await vis(ad.locator("nav").getByText("ورود از علی‌بابا")), "nav item");
  await upload(ad, "sample1.mhtml", S1);
  await ad.waitForURL(/\/admin\/import\/[0-9a-f-]{36}$/, { timeout: 30000 });
  id1 = idOf(ad);
  ok(await vis(ad.getByRole("heading", { name: "Wholesale Disposable Portable Smokeless Ashtray With Gel" })), "review page: title");
  ok((await ad.getByTestId("price-tiers").locator("tbody tr").count()) === 3, "review: 3 price tiers");
  ok((await ad.getByTestId("attributes").locator("tr").count()) === 18, "review: 18 attributes");
  ok((await ad.getByTestId("warnings").innerText()).includes("Quantity: 25 pieces"), "review: ambiguous quantity warning");
  ok((await ad.getByTestId("fields").innerText()).includes("وزن کارتن: پیدا نشد"), "review: field status badges");
  ok(await vis(ad.getByText("Sample Supplier A Technology Co., Ltd.")), "review: supplier name (admin)");
  ok((await ad.locator('a[href="https://supplier-a.en.alibaba.com/company_profile.html"]').count()) === 1, "review: supplier profile link");
  ok((await ad.locator('a[href^="https://www.alibaba.com/product-detail/"]').count()) === 1, "review: product link");
  ok((await ad.getByTestId("images").locator("img").count()) === 6, "review: 6 gallery images from DB");
  const src = await ad.getByTestId("images").locator("img").first().getAttribute("src");
  const r = await getStatus(ad, src);
  ok(r.s === 200 && r.type === "image/png" && r.nosniff === "nosniff", `image served from DB with real type (sniffed), nosniff (${JSON.stringify(r)})`);
  ok(
    psql(
      `select status || '|' || parser_version || '|' || (octet_length(html_gz) < html_bytes) || '|' || (select count(*) from raw_page_images where raw_page_id='${id1}') from raw_pages where id='${id1}'`,
    ) === "new|1|true|6",
    "DB: new, parser v1, gzipped html, 6 images",
  );
  ok(
    psql(`select count(*) from raw_page_images where raw_page_id='${id1}' and bytes is not null and storage_key is null`) === "6",
    "images stored as bytes (storage_key empty until S3)",
  );
  const anon = await (await launch()).page();
  await anon.goto(B + "/");
  ok((await getStatus(anon, src)).s === 404, "image route: 404 without login");
}

// ---------- تکراری ----------
{
  await upload(ad, "sample1-again.mhtml", S1);
  ok(await vis(ad.getByText("همین فایل قبلاً وارد شده است."), 15000), "same file → rejected");
  ok((await ad.getByRole("link", { name: "دیدن صفحه‌ی قبلی" }).getAttribute("href")) === `/admin/import/${id1}`, "link to the earlier page");
  // همین محصول، فایل دیگر (یک بایت فرق) + فروشنده‌ی ثبت‌شده + لیستینگ موجود
  const co = psql(`insert into companies (name_en, company_type) values ('Sample Supplier A ${run}', 'trading') returning id`).split("\n")[0];
  psql(`insert into company_external_ids (company_id, platform, external_id) values ('${co}', 'alibaba', 'supplier-a')`);
  await upload(ad, "sample1b.mhtml", await mhtml("sample1", { extra: "<!-- b -->" }));
  await ad.waitForURL(/\/admin\/import\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const dupText = await ad.getByTestId("duplicates").innerText();
  ok(dupText.includes("همین محصول ۱ بار دیگر آپلود شده") && dupText.includes(`Sample Supplier A ${run}`), `duplicates: same product + known supplier (${dupText.slice(0, 120)})`);
  const pid = psql(`select external_product_id from raw_pages where id='${id1}'`);
  const listing = psql("select id from product_listings order by created_at limit 1");
  psql(`insert into listing_external_ids (listing_id, platform, external_id) values ('${listing}', 'alibaba', '${pid}')`);
  await ad.reload();
  ok((await ad.getByTestId("duplicates").innerText()).includes("قبلاً به لیستینگی وصل شده"), "duplicates: already linked listing");
  await ad.goto(B + "/admin/import");
  const row = ad.getByTestId("import-row").first();
  ok((await row.innerText()).includes("فروشنده ثبت شده") && (await row.innerText()).includes("لیستینگ موجود است"), "list: duplicate badges");
  psql("delete from listing_external_ids");
}

// ---------- وضعیت‌ها ----------
{
  await ad.goto(B + `/admin/import/${id1}`);
  await ad.locator("summary", { hasText: "رد کردن" }).click();
  await ad.locator('input[name="reason"]').fill("قیمت قدیمی");
  await ad.getByRole("button", { name: "رد کن" }).click();
  ok(await waitFor(() => psql(`select status || '|' || coalesce(reject_reason,'') from raw_pages where id='${id1}'`) === "rejected|قیمت قدیمی"), "reject with reason");
  ok(psql(`select count(*) from raw_page_images where raw_page_id='${id1}'`) === "0", "reject deletes images");
  await ad.goto(B + "/admin/import?status=rejected");
  ok((await ad.getByTestId("import-row").count()) === 1, "rejected tab");
  await ad.goto(B + `/admin/import/${id1}`);
  await ad.getByRole("button", { name: "بازگرداندن" }).click();
  ok(await waitFor(() => psql(`select status from raw_pages where id='${id1}'`) === "new"), "restore → new");
  await ad.getByRole("button", { name: "بررسی شد" }).click();
  ok(await waitFor(() => psql(`select status || '|' || (reviewed_by is not null) from raw_pages where id='${id1}'`) === "reviewed|true"), "mark reviewed");
}

// ---------- خواندن دوباره ----------
{
  psql(`update raw_pages set parser_version = 0, parsed = jsonb_set(parsed, '{title}', '"OLD"'), title = 'OLD' where id='${id1}'`);
  await ad.goto(B + "/admin/import?status=reviewed");
  ok((await ad.getByTestId("import-row").first().innerText()).includes("خواننده‌ی قدیمی"), "list: old parser badge");
  await ad.goto(B + `/admin/import/${id1}`);
  await ad.getByRole("button", { name: "خواندن دوباره" }).click();
  ok(
    await waitFor(() => psql(`select parser_version || '|' || title from raw_pages where id='${id1}'`) === "1|Wholesale Disposable Portable Smokeless Ashtray With Gel"),
    "reparse from stored HTML",
  );
  psql("update raw_pages set parser_version = 0");
  await ad.goto(B + "/admin/import");
  await ad.getByRole("button", { name: /خواندن دوباره‌ی/ }).click();
  ok(await waitFor(() => psql("select count(*) from raw_pages where parser_version = 0") === "0"), "reparse all old pages");
}

// ---------- فایل نادرست، سقف حجم، هم‌زمانی ----------
{
  await upload(ad, "notes.txt", Buffer.from("just text, not a page"));
  ok(await vis(ad.getByText(/Webpage, Single File/).last(), 15000), "non-page file → guidance error");
  const big = await post(ad, { zeros: 26 * 1024 * 1024 }, { name: "big.mhtml" });
  ok(big.s === 413, `> 25 MB → 413 (${big.s})`);
  const noHeader = await post(ad, S1, { header: false });
  ok(noHeader.s === 403, "without x-yc-upload header → 403 (CSRF)");
  const [s2, s3] = await Promise.all([post(ad, await mhtml("sample2"), { name: "s2.mhtml" }), post(ad, await mhtml("sample3"), { name: "s3.mhtml" })]);
  ok(s2.s === 200 && s3.s === 200, `two uploads at once both succeed (queued) (${s2.s}, ${s3.s})`);
  ok(psql("select count(*) from raw_pages") === "4", "4 pages");
  const p3 = s3.j.id;
  ok(psql(`select count(*) from raw_page_images where raw_page_id='${p3}'`) === "6", "sample3: 6 gallery images (description images links only)");
}

// ---------- حجم عکس‌ها و هشدار ۱ گیگابایت ----------
{
  await ad.goto(B + "/admin/import");
  ok(/^[\d۰-۹٫.]+$/.test((await ad.getByTestId("db-image-mb").innerText()).trim()), "DB image size shown");
  const fake = psql("select id from raw_pages limit 1");
  psql(`insert into raw_page_images (raw_page_id, url, mime, size, bytes) values ('${fake}', 'https://x/fake-${run}', 'image/png', 1100000000, '\\x00')`);
  await ad.goto(B + "/admin");
  ok(await vis(ad.getByText(/از ۱ گیگابایت گذشته/)), "1 GB warning banner");
  psql(`delete from raw_page_images where url='https://x/fake-${run}'`);
  await ad.reload();
  ok((await ad.getByText(/از ۱ گیگابایت گذشته/).count()) === 0, "banner gone under 1 GB");
}

// ---------- دسترسی‌ها ----------
{
  setS("auth.enforce_permissions", true);
  const role = (keys) => {
    psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
    psql(
      `insert into role_permissions (role_id, permission_key) select r.id, k from roles r, unnest(array[${["dashboard.view", ...keys].map((k) => `'${k}'`).join(",")}]) k where r.key='expert'`,
    );
  };
  const ex = await page();
  await expert(ex);
  role([]);
  const r = await ex.goto(B + "/admin/import");
  ok(!ex.url().endsWith("/admin/import") || (await ex.getByText("دسترسی").count()) > 0 || r.status() === 403, "no catalog.import → import page blocked");
  const up = await post(ex, S1);
  ok(up.s === 403, "no catalog.import → upload API 403");
  // فقط catalog.import: فروشنده و لینک‌ها پنهان
  role(["catalog.import"]);
  await ex.goto(B + `/admin/import/${id1}`);
  ok(await vis(ex.getByText("اطلاعات فروشنده فقط با دسترسی «دیدن کارخانه‌ها».")), "catalog.import only: supplier hidden");
  ok((await ex.locator('a[href*="alibaba.com"]').count()) === 0, "catalog.import only: no Alibaba links");
  role(["catalog.import", "companies.view", "companies.links"]);
  await ex.reload();
  ok((await ex.locator('a[href="https://supplier-a.en.alibaba.com/company_profile.html"]').count()) === 1, "with companies.view + companies.links: profile link");
  // companies.links در صفحه‌ی کارخانه
  const co = psql(`select company_id from company_external_ids where external_id='supplier-a'`);
  psql(`update company_external_ids set url='https://supplier-a.en.alibaba.com/' where external_id='supplier-a'`);
  role(["companies.view"]);
  await ex.goto(B + `/admin/companies/${co}`);
  ok((await ex.locator('a[href="https://supplier-a.en.alibaba.com/"]').count()) === 0, "company page: link hidden without companies.links");
  role(["companies.view", "companies.links"]);
  await ex.reload();
  ok((await ex.locator('a[href="https://supplier-a.en.alibaba.com/"]').count()) === 1, "company page: link shown with companies.links");
  // products.publish: آماده کردن بدون انتشار
  const prod = psql(`insert into products (slug, title_fa, status) values ('imp-${run}', 'محصول آزمایشی ورود', 'draft') returning id`).split("\n")[0];
  role(["products.manage"]);
  await ex.goto(B + `/admin/products/${prod}`);
  // isDisabled() پلی‌رایت برای <option disabled> درست کار نمی‌کند؛ خود ویژگی DOM خوانده می‌شود
  ok(await ex.locator('select[name="status"] option[value="published"]').evaluate((o) => o.disabled), "no products.publish: «published» option disabled");
  await ex.evaluate(() => {
    const o = document.querySelector('select[name="status"] option[value="published"]');
    o.disabled = false;
    document.querySelector('select[name="status"]').value = "published";
  });
  await ex
    .locator("form", { has: ex.locator('select[name="status"]') })
    .getByRole("button", { name: "ذخیره" })
    .first()
    .click();
  ok(await vis(ex.getByText(/products\.publish/)), "forced publish without permission → error");
  ok(psql(`select status from products where id='${prod}'`) === "draft", "product stays draft");
  role(["products.manage", "products.publish"]);
  await ex.reload();
  await ex.locator('select[name="status"]').selectOption("published");
  await ex
    .locator("form", { has: ex.locator('select[name="status"]') })
    .getByRole("button", { name: "ذخیره" })
    .first()
    .click();
  ok(await waitFor(() => psql(`select status from products where id='${prod}'`) === "published"), "with products.publish → published");
  psql(`delete from products where id='${prod}'`);
  psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
  psql("insert into role_permissions (role_id, permission_key) select id, 'dashboard.view' from roles where key='expert'");
  setS("auth.enforce_permissions", false);
}

psql("delete from raw_pages");
psql(`delete from company_external_ids where external_id='supplier-a'`);
psql(`delete from companies where name_en like 'Sample Supplier A ${run}'`);
await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
