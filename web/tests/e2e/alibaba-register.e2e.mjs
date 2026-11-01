// اصلاح و «ثبت» صفحه‌ی واردشده از علی‌بابا (migration ۰۰۱۳): Highlights جدا از عبارت‌های تبلیغاتی، سابقه و سال تأسیس جدا،
// فروشنده‌ی مشترک بین صفحه‌ها، اصلاح‌ها (انتخاب «Quantity» مبهم، تخمین کارتن، ماندن بعد از خواندن دوباره)، ثبت فروشنده/محصول/دسته/لیستینگ/
// قیمت‌ها/زمان آماده‌سازی/عکس‌ها، عکس از دیتابیس (/media-db) و دسترسی‌ها. docs/infoyaarchin.md بخش ۳۷.
// اجرا: TEST_DB=postgres://…/yarchin_e2e node tests/e2e/alibaba-register.e2e.mjs
import { mhtml } from "./alibaba-mhtml.mjs";
import { B, admin, done, expert, launch, ok, psql, setS, sleep, vis, waitFor } from "./lib.mjs";

const run = Date.now().toString(36);
const SLUG = `ashtray-imp-${run}`;
const cleanup = () => {
  psql("delete from raw_pages");
  psql("delete from listing_external_ids where external_id in ('9216766571035', '9274764411741', '9406360732090')");
  psql(`delete from product_media where storage_key like '/media-db/%'`);
  psql(`delete from price_observations where listing_id in (select id from product_listings where source = 'import')`);
  psql(`delete from lead_time_observations where listing_id in (select id from product_listings where source = 'import')`);
  psql(`delete from product_listings where source = 'import'`);
  psql(`delete from products where source = 'import'`);
  psql("delete from company_external_ids where external_id in ('supplier-a', 'supplier-b')");
  psql(`delete from companies where source = 'import'`);
  psql(`delete from categories where source = 'import'`);
};
cleanup();
setS("auth.enforce_permissions", false);
const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);

// درخواست از داخل صفحه (کوکی نشست secure است و APIRequestContext پلی‌رایت آن را روی http نمی‌فرستد)
const post = (p, buf, name) =>
  p.evaluate(
    async ([b64, n]) => {
      const r = await fetch("/api/admin/import/upload", {
        method: "POST",
        headers: { "x-yc-upload": "1", "x-file-name": n, "content-type": "application/octet-stream" },
        body: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      });
      return (await r.json()).id;
    },
    [buf.toString("base64"), name],
  );
const get = (p, url, accept) =>
  p.evaluate(
    async ([u, acc]) => {
      // no-store: پاسخ عمومی کش می‌شود و بررسی «بعد از غیرعمومی شدن» را خراب می‌کند
      const r = await fetch(u, { cache: "no-store", ...(acc ? { headers: { accept: acc } } : {}) });
      return { s: r.status, type: r.headers.get("content-type"), cache: r.headers.get("cache-control"), vary: r.headers.get("vary") };
    },
    [url, accept],
  );
const reg = (p) => p.getByTestId("register");
const submitRegister = (p) => reg(p).getByRole("button", { name: "ثبت", exact: true }).click();

await ad.goto(B + "/admin/import");
const id1 = await post(ad, await mhtml("sample1", { avif: true }), "s1.mhtml");
const id2 = await post(ad, await mhtml("sample2"), "s2.mhtml");
const id3 = await post(ad, await mhtml("sample3"), "s3.mhtml");
ok([id1, id2, id3].every(Boolean), "3 pages uploaded");

// ---------- خواننده‌ی نسخه‌ی ۲ در صفحه‌ی بررسی ----------
{
  await ad.goto(B + `/admin/import/${id1}`);
  ok((await ad.getByTestId("highlights").locator("li").count()) === 5, "highlights: 5 real features");
  ok((await ad.getByTestId("promo").locator("li").count()) === 15, "promo phrases: 15, separate (collapsed)");
  ok(!(await ad.getByTestId("promo").isVisible()), "promo list collapsed by default");
  const sup = await ad.getByTestId("supplier-line").innerText();
  ok(
    /سابقه در علی‌بابا: ۱ سال/.test(sup) && sup.includes("(1 yr)") && /سال تأسیس \(از متن فروشنده\): 2016/.test(sup),
    `supplier: years on Alibaba and founded year separate (${sup})`,
  );
  ok(sup.includes(" | ") && !sup.includes("·"), "separator « | », no «·» next to numbers");
  const dup = await ad.getByTestId("duplicates").innerText();
  ok(dup.includes("همین فروشنده در ۱ صفحه‌ی آپلودشده‌ی دیگر هم هست") && dup.includes("Biodegradable"), `shared supplier detected before registration (${dup.slice(0, 160)})`);
  await ad.goto(B + "/admin/import");
  ok((await ad.getByTestId("import-row").filter({ hasText: "Biodegradable" }).innerText()).includes("همین فروشنده در ۱ صفحه‌ی دیگر"), "list: shared supplier badge");
}

// ---------- اصلاح‌ها ----------
{
  await ad.goto(B + `/admin/import/${id1}`);
  const q = ad.getByTestId("qty-choice");
  ok(await vis(q), "ambiguous «Quantity: 25 pieces» → choice open by default");
  ok((await q.innerText()).includes("۲۵ عدد در هر کارتن") && (await q.innerText()).includes("۲۵ عدد در هر بسته"), "choices: per pack / per carton / other");
  await q.locator('input[value="carton"]').check();
  await ad.locator('input[name="unitWeightKg"]').fill("0.01");
  await ad.locator('input[name="unitL"]').fill("9");
  await ad.locator('input[name="unitW"]').fill("9");
  await ad.locator('input[name="unitH"]').fill("3");
  await ad.locator('input[name="hsCode"]').fill("");
  await ad.getByRole("button", { name: "ذخیره‌ی اصلاح‌ها" }).click();
  ok(await vis(ad.getByText(/ذخیره شد \(/), 15000), "edits saved");
  const data = JSON.parse(psql(`select data from raw_page_edits where raw_page_id='${id1}'`));
  ok(
    data.qtyChoice?.kind === "carton" && data.qtyChoice.value === 25 && data.unitWeightKg === 0.01 && !("title" in data) && !("priceTiers" in data),
    `only changed fields stored (${Object.keys(data)})`,
  );
  await ad.reload();
  const pk = await ad.getByTestId("packing").innerText();
  ok(pk.includes("تعداد در کارتن: ۲۵") && pk.includes("تخمینی") && pk.includes("اصلاح‌شده"), `carton estimated from the choice (${pk.replace(/\n/g, " ")})`);
  // خواندن دوباره: اصلاح‌ها می‌مانند
  await ad.getByRole("button", { name: "خواندن دوباره" }).click();
  await sleep(1500);
  await ad.reload();
  ok((await ad.getByTestId("packing").innerText()).includes("تعداد در کارتن: ۲۵"), "edits survive reparse");
  // HS code نامعتبر موقع ثبت رد می‌شود (دیتابیس تست نرخ‌ها را دارد)
  await ad.locator("summary", { hasText: "اصلاح مقدارها" }).click();
  await ad.locator('input[name="hsCode"]').fill("0000.00");
  await ad.getByRole("button", { name: "ذخیره‌ی اصلاح‌ها" }).click();
  await ad.getByText(/ذخیره شد \(/).waitFor();
}

// ---------- ثبت sample1: فروشنده‌ی تازه، محصول تازه، دسته‌ی تازه ----------
let prod, listing1, company1;
{
  await ad.goto(B + `/admin/import/${id1}`);
  const r = reg(ad);
  ok(await r.locator('input[name="companyMode"][value="new"]').isChecked(), "supplier: new by default (not registered yet)");
  await r.locator('input[name="productMode"][value="new"]').check();
  await r.locator('input[name="titleFa"]').fill("زیرسیگاری یک‌بار مصرف ژل‌دار");
  await r.locator('input[name="slug"]').fill(SLUG);
  await r.locator('select[name="categoryId"]').selectOption("new");
  await r.locator('input[name="newCategoryFa"]').fill("زیرسیگاری");
  ok((await r.locator('input[name="newCategoryEn"]').inputValue()) === "Ashtrays", "new category: English name from Alibaba path");
  await r.getByRole("button", { name: "همه عمومی" }).click();
  ok((await r.locator('input[name^="public_"]:checked').count()) === 6, "«همه عمومی» checks all 6");
  await submitRegister(ad);
  ok(await vis(ad.getByRole("alert").filter({ hasText: "HS code" })), "unknown HS code → error, nothing saved");
  ok(psql(`select status from raw_pages where id='${id1}'`) === "new", "page still new after error");
  psql(`update raw_page_edits set data = data - 'hsCode' where raw_page_id='${id1}'`);
  await ad.reload();
  await r.locator('input[name="productMode"][value="new"]').check();
  await r.locator('input[name="titleFa"]').fill("زیرسیگاری یک‌بار مصرف ژل‌دار");
  await r.locator('input[name="slug"]').fill(SLUG);
  await r.locator('select[name="categoryId"]').selectOption("new");
  await r.locator('input[name="newCategoryFa"]').fill("زیرسیگاری");
  await r.getByRole("button", { name: "همه عمومی" }).click();
  await submitRegister(ad);
  await ad.waitForURL(/\/admin\/products\/[0-9a-f-]{36}\/listings\/[0-9a-f-]{36}\?imported=1$/, { timeout: 20000 });
  [prod, listing1] = ad
    .url()
    .split("?")[0]
    .split("/")
    .filter((x) => /^[0-9a-f-]{36}$/.test(x));
  company1 = psql(`select company_id from raw_pages where id='${id1}'`);
  ok(
    psql(`select status || '|' || (product_id = '${prod}') || '|' || (listing_id = '${listing1}') from raw_pages where id='${id1}'`) === "imported|true|true",
    "raw page → imported, linked",
  );
  ok(
    psql(
      `select source || '|' || company_type || '|' || (meta->'alibaba'->>'foundedYear') || '|' || (meta->'alibaba'->>'yearsOnAlibaba') from companies where id='${company1}'`,
    ) === "import|trading|2016|1",
    "company: source import, type, founded year and years on Alibaba in meta",
  );
  ok(
    psql(`select count(*) from company_external_ids where company_id='${company1}' and platform='alibaba' and external_id='supplier-a'`) === "1",
    "company external id (store id)",
  );
  ok(
    psql(
      `select p.status || '|' || p.source || '|' || p.units_per_carton || '|' || p.unit_weight_kg::float || '|' || c.name_en || '|' || c.source from products p join categories c on c.id = p.category_id where p.id='${prod}'`,
    ) === "draft|import|25|0.01|Ashtrays|import",
    "product: draft, packing from edits, new category",
  );
  ok(psql(`select count(*) from listing_external_ids where listing_id='${listing1}' and external_id='9216766571035'`) === "1", "listing external id");
  ok(
    psql(
      `select count(*) || '|' || count(distinct observed_at) || '|' || bool_and(source = 'import' and raw_page_id = '${id1}') from price_observations where listing_id='${listing1}'`,
    ) === "3|1|true",
    "3 price tiers in one batch, source import, raw_page_id",
  );
  ok(psql(`select count(*) || '|' || bool_and(source = 'import') from lead_time_observations where listing_id='${listing1}'`) === "3|true", "3 lead-time tiers");
  ok(
    psql(
      `select count(*) || '|' || bool_and(is_public) || '|' || bool_and(storage_key like '/media-db/%') || '|' || bool_and(width = 64) from product_media where product_id='${prod}'`,
    ) === "6|true|true|true",
    "6 images: keys /media-db/<id>, public, real size",
  );
  // صفحه‌ی ثبت‌شده دیگر فرم اصلاح و ثبت ندارد
  await ad.goto(B + `/admin/import/${id1}`);
  ok((await ad.getByTestId("register").count()) === 0 && (await ad.getByText("اصلاح مقدارها").count()) === 0, "imported page: no edit/register forms");
}

// ---------- عکس از دیتابیس ----------
{
  const keys = psql(`select storage_key from product_media where product_id='${prod}' order by sort_order`).split("\n");
  const anonCtx = await launch();
  const anon = await anonCtx.page();
  await anon.goto(B + "/");
  ok((await get(anon, keys[0])).s === 404, "/media-db: 404 for visitor while product is draft");
  const st = await get(ad, keys[0]);
  ok(st.s === 200 && /private/.test(st.cache), `/media-db: staff sees draft image (private cache) (${JSON.stringify(st)})`);
  psql(`update products set status='published' where id='${prod}'`);
  const avif = await get(anon, keys[0], "image/avif,image/webp,*/*");
  ok(
    avif.s === 200 && avif.type === "image/avif" && /^public, max-age=86400$/.test(avif.cache) && /\bAccept\b/.test(avif.vary),
    `published + public → AVIF, long cache (${JSON.stringify(avif)})`,
  );
  const jpg = await get(anon, keys[0], "image/webp,*/*");
  ok(jpg.s === 200 && jpg.type === "image/jpeg", `browser without AVIF → JPEG (${jpg.type})`);
  ok((await get(anon, keys[1])).type === "image/png", "PNG served as is");
  psql(`update product_media set is_public=false where storage_key='${keys[1]}'`);
  ok((await get(anon, keys[1])).s === 404, "non-public image → 404 for visitor");
  ok((await get(anon, "/media-db/abc")).s === 404, "bad id → 404");
  await anon.goto(B + `/p/${SLUG}`);
  ok((await anon.locator(`img[src*="/media-db/"]`).count()) > 0, "public product page shows DB images");
  await anonCtx.b.close();
}

// ---------- sample2: همان فروشنده (خودکار)، همان محصول ----------
let listing2;
{
  await ad.goto(B + `/admin/import/${id2}`);
  const r = reg(ad);
  ok(
    (await r.innerText()).includes("فروشنده‌ی ثبت‌شده") && (await r.locator('input[name="companyId"]').inputValue()) === company1,
    "sample2: registered supplier picked automatically",
  );
  ok((await r.locator('select[name="categoryId"] option:checked').innerText()).includes("(پیشنهاد)"), "category suggested from Alibaba path");
  ok((await r.locator(`select[name="productId"] option[value="${prod}"]`).count()) === 1, "product suggested (same supplier / words)");
  await r.locator('input[name="productMode"][value="existing"]').check();
  await r.locator('select[name="productId"]').selectOption(prod);
  await submitRegister(ad);
  await ad.waitForURL(/\?imported=1$/, { timeout: 20000 });
  listing2 = ad.url().split("?")[0].split("/").pop();
  ok(listing2 !== listing1 && psql(`select company_id from product_listings where id='${listing2}'`) === company1, "sample2: second listing, same supplier");
  ok(psql(`select count(*) from companies where source='import'`) === "1", "no duplicate supplier");
  ok(psql(`select count(*) from product_media where product_id='${prod}'`) === "12", "sample2 images added (not public by default)");
  ok(psql(`select count(*) from product_media where product_id='${prod}' and is_public`) === "5", "default: new images not public");
}

// ---------- sample3: فروشنده‌ی تازه، همان محصول ----------
{
  await ad.goto(B + `/admin/import/${id3}`);
  const r = reg(ad);
  ok((await ad.getByTestId("qty-choice").count()) === 0, "sample3: no ambiguous quantity");
  await r.locator('input[name="companyMode"][value="new"]').check();
  await r.locator('input[name="productMode"][value="existing"]').check();
  await r.locator('select[name="productId"]').selectOption(prod);
  for (const c of await r.locator('input[name="image"]').all()) await c.uncheck();
  await submitRegister(ad);
  await ad.waitForURL(/\?imported=1$/, { timeout: 20000 });
  ok(psql(`select count(*) from companies where source='import'`) === "2", "sample3: second supplier");
  ok(psql(`select count(*) from product_media where product_id='${prod}'`) === "12", "unchecked images not added");
  // سایت: میانگین از ۲ کارخانه، بدون اسم کارخانه
  const api = await ad.evaluate(async (s) => await (await fetch(`/api/v1/products/${s}`)).text(), SLUG);
  const pr = JSON.parse(api).product;
  ok(
    pr.suppliers === 2 && pr.price?.pricedSuppliers === 2 && pr.price.min <= pr.price.avg && pr.price.avg <= pr.price.max,
    `public API: average from 2 suppliers (${JSON.stringify(pr.price)})`,
  );
  ok(!/Sample Supplier|supplier-a|supplier-b|alibaba\.com/i.test(api), "public API: no supplier name, id or link");
}

// ---------- آپلود دوباره‌ی همان محصول ← همان لیستینگ، نوبت قیمت تازه ----------
{
  const id1b = await post(ad, await mhtml("sample1", { extra: "<!-- again -->" }), "s1-again.mhtml");
  await ad.goto(B + `/admin/import/${id1b}`);
  ok((await ad.getByTestId("duplicates").innerText()).includes("با ثبت، همان لیستینگ به‌روز می‌شود"), "re-upload: same listing notice");
  const r = reg(ad);
  ok(
    (await r.locator('select[name="productId"]').inputValue()) === prod && (await r.locator('input[name="productMode"][value="existing"]').isChecked()),
    "re-upload: linked product preselected",
  );
  ok((await r.locator('input[name="image"]:checked').count()) === 0, "re-upload: images unchecked by default (no duplicates)");
  await ad.waitForTimeout(1100);
  await submitRegister(ad);
  await ad.waitForURL(/\?imported=1$/, { timeout: 20000 });
  ok(ad.url().split("?")[0].endsWith(listing1), "same listing updated");
  ok(psql(`select count(distinct observed_at) || '|' || count(*) from price_observations where listing_id='${listing1}'`) === "2|6", "new price batch, old kept");
  ok(psql(`select count(*) from product_media where product_id='${prod}'`) === "12", "no duplicate images");
}

// ---------- دسترسی‌ها ----------
{
  const id2b = await post(ad, await mhtml("sample2", { extra: "<!-- perm -->" }), "s2-perm.mhtml");
  psql(`delete from company_external_ids where external_id='supplier-a'`); // تا «فروشنده‌ی تازه» ممکن باشد
  setS("auth.enforce_permissions", true);
  const role = (keys) => {
    psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
    psql(
      `insert into role_permissions (role_id, permission_key) select r.id, k from roles r, unnest(array[${["dashboard.view", ...keys].map((k) => `'${k}'`).join(",")}]) k where r.key='expert'`,
    );
  };
  const ex = await page();
  await expert(ex);
  role(["catalog.import"]);
  await ex.goto(B + `/admin/import/${id2b}`);
  ok((await reg(ex).innerText()).includes("دسترسی «دیدن کارخانه‌ها» لازم است"), "register needs companies.view");
  role(["catalog.import", "companies.view"]);
  await ex.reload();
  ok((await reg(ex).innerText()).includes("دسترسی «مدیریت محصولات» لازم است"), "register needs products.manage");
  role(["catalog.import", "companies.view", "products.manage"]);
  await ex.reload();
  const r = reg(ex);
  ok(await r.locator('input[name="companyMode"][value="new"]').isDisabled(), "no companies.manage: «new supplier» disabled");
  ok((await r.locator('select[name="categoryId"] option[value="new"]').count()) === 0, "no categories.manage: no «new category» option");
  // دور زدن فرم: سرور هم رد می‌کند
  await ex.evaluate(() => {
    const n = document.querySelector('[data-testid="register"] input[name="companyMode"][value="new"]');
    n.disabled = false;
    n.checked = true;
  });
  await r.locator('input[name="productMode"][value="existing"]').check();
  await r.locator('select[name="productId"]').selectOption(prod);
  await submitRegister(ex);
  ok(await vis(ex.getByRole("alert").filter({ hasText: "ثبت و ویرایش کارخانه‌ها" })), "forced new supplier without companies.manage → error");
  await ex.evaluate(() => {
    const s = document.querySelector('[data-testid="register"] select[name="categoryId"]');
    s.add(new Option("x", "new"));
    s.value = "new";
    document.querySelector('[data-testid="register"] input[name="companyMode"][value="existing"]').checked = true;
  });
  await r.locator('input[name="productMode"][value="new"]').check();
  await r.locator('select[name="companyId"]').selectOption(company1);
  await submitRegister(ex);
  ok(await vis(ex.getByRole("alert").filter({ hasText: "مدیریت دسته‌بندی‌ها" })), "forced new category without categories.manage → error");
  ok(psql(`select status from raw_pages where id='${id2b}'`) === "new", "nothing registered");
  psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
  psql("insert into role_permissions (role_id, permission_key) select id, 'dashboard.view' from roles where key='expert'");
  setS("auth.enforce_permissions", false);
}

cleanup();
await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
