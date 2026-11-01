// صفحه‌ی «آموزش» پنل (بخش ۴۲): منو، دسترسی guide.view، فهرست بخش‌ها و لینک‌ها، رنگ تیترها، موبایل.
// اجرا: TEST_DB=postgres://…/yarchin_e2e node tests/e2e/guide.e2e.mjs
import { B, admin, done, expert, launch, ok, psql, setS, sleep, vis } from "./lib.mjs";

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);

// ---------- منو و صفحه (مدیر) ----------
{
  const links = await ad.locator("aside nav a").allInnerTexts();
  ok(links.at(-1)?.trim() === "آموزش", `«آموزش» last in the side menu (${links.slice(-2).join(" / ")})`);
  await ad.locator("aside nav a", { hasText: "آموزش" }).click();
  await ad.waitForURL(/\/admin\/guide$/);
  ok(await vis(ad.getByRole("heading", { name: "آموزش پنل یارچین" })), "page title from the guide file");
  const toc = ad.getByTestId("guide-toc").locator("a");
  const sections = ad.getByTestId("guide-section");
  const nToc = await toc.count();
  ok(nToc >= 20 && nToc === (await sections.count()), `table of contents = sections (${nToc})`);
  const hrefs = await toc.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const ids = await sections.evaluateAll((ss) => ss.map((s) => `#${s.id}`));
  ok(JSON.stringify(hrefs) === JSON.stringify(ids), "every link points to its section");
  await toc.filter({ hasText: "ورود از علی‌بابا" }).click();
  ok(ad.url().endsWith("#import") && (await ad.locator("#import h2").innerText()) === "ورود از علی‌بابا", "link → section");
  const h2 = await ad.locator("#products h2").evaluate((el) => {
    const c = getComputedStyle(el);
    return { color: c.color, size: parseFloat(c.fontSize), body: parseFloat(getComputedStyle(el.parentElement.querySelector("p, li")).fontSize) };
  });
  ok(h2.color === "rgb(255, 122, 0)" && h2.size > h2.body, `headings: brand orange, larger than text (${JSON.stringify(h2)})`);
  const txt = await ad.locator("main").innerText();
  ok(txt.includes("Firefox ESR") && txt.includes("Ctrl و منفی"), "old-browser tips (both)");
  ok(!/<!--|\{#|\*\*/.test(txt), "no raw markup visible");
  ok((await ad.locator("#import h3").count()) >= 5 && (await ad.locator("#import ol li").count()) >= 4, "sub-headings and numbered steps");
}

// ---------- موبایل ----------
{
  const m = await page({ viewport: { width: 360, height: 800 } });
  await admin(m);
  await m.goto(B + "/admin/guide");
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "mobile: no horizontal scroll");
}

// ---------- دسترسی ----------
{
  setS("auth.enforce_permissions", true);
  const role = (keys) => {
    psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
    psql(
      `insert into role_permissions (role_id, permission_key) select r.id, k from roles r, unnest(array[${["dashboard.view", ...keys].map((k) => `'${k}'`).join(",")}]) k where r.key='expert'`,
    );
  };
  role([]);
  const ex = await page();
  await expert(ex);
  ok((await ex.locator("aside nav a", { hasText: "آموزش" }).count()) === 0, "no guide.view: no menu item");
  await ex.goto(B + "/admin/guide");
  ok(!ex.url().endsWith("/admin/guide"), `no guide.view: page blocked (${ex.url()})`);
  role(["guide.view"]);
  await ex.goto(B + "/admin");
  ok((await ex.locator("aside nav a", { hasText: "آموزش" }).count()) === 1, "guide.view: menu item");
  await ex.goto(B + "/admin/guide");
  ok(ex.url().endsWith("/admin/guide") && (await ex.getByTestId("guide-section").count()) > 0, "guide.view: page opens");
  // انتخاب‌شدنی در «نقش‌ها و دسترسی»
  const expertRole = psql("select id from roles where key='expert'");
  await ad.goto(B + `/admin/roles/${expertRole}`);
  ok(await vis(ad.getByText("دیدن آموزش پنل")), "permission listed in roles page");
  ok((await ad.locator("main").innerText()).includes("آموزش"), "group «آموزش»");
  psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
  psql("insert into role_permissions (role_id, permission_key) select id, 'dashboard.view' from roles where key='expert'");
  setS("auth.enforce_permissions", false);
}

await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
