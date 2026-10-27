// «محتوای سایت» در پنل (هدر، فوتر، اسلایدر، درباره، تماس) و «پیام‌های تماس». هر تغییر باید همان لحظه در سایت دیده شود.
// آخر کار site_blocks پاک می‌شود (برگشت به پیش‌فرض). اجرا: TEST_DB=… node tests/e2e/admin-site.e2e.mjs — docs/infoyaarchin.md بخش ۱۷.
import { B, admin, done, launch, ok, psql, vis, waitFor } from "./lib.mjs";

const run = Date.now().toString(36);
psql("delete from site_blocks");
const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
const site = await page();

const save = async () => {
  await ad.getByRole("button", { name: "ذخیره" }).click();
  await ad.waitForTimeout(800);
};
const check = (name, on) => ad.locator(`input[type="checkbox"][name="${name}"]`).setChecked(on);

ok((await ad.goto(B + "/admin/site")).status() === 200 && (await ad.locator('a[href="/admin/site/footer"]').count()) === 1, "site content index");

// هدر: متن نوار بالا
await ad.goto(B + "/admin/site/header");
await check("b:topBar.visible", true);
await ad.fill('input[name="topBar.text"]', `نوار بالای تست ${run}`);
await save();
await site.goto(B + "/");
ok(await vis(site.getByText(`نوار بالای تست ${run}`)), "header: top bar text shows on site");
await ad.goto(B + "/admin/site/header");
await check("b:topBar.visible", false);
await save();
await site.goto(B + "/");
ok((await site.getByText(`نوار بالای تست ${run}`).count()) === 0, "header: hiding top bar works");

// فوتر: تلفن و اینماد
await ad.goto(B + "/admin/site/footer");
await check("b:contact.visible", true);
await ad.fill('input[name="contact.phone"]', "021-5555" + run.slice(-4).replace(/\D/g, "1"));
await save();
const phone = await ad.inputValue('input[name="contact.phone"]');
await site.goto(B + "/");
ok(await vis(site.locator("footer").getByText(phone)), "footer: contact phone shows on site");
await check("b:enamad.visible", true);
await ad.fill('input[name="enamad.id"]', "123456");
await ad.fill('input[name="enamad.code"]', "TESTCODE");
await save();
await site.route("**/trustseal.enamad.ir/**", (r) => r.abort());
await site.goto(B + "/");
ok((await site.locator('footer a[href*="trustseal.enamad.ir/?id=123456"]').count()) === 1, "footer: enamad seal link with id/code");
ok((await site.locator('footer img[src*="trustseal.enamad.ir/logo.aspx"]').getAttribute("referrerpolicy")) === "origin", "footer: enamad img referrerPolicy=origin");
await check("b:enamad.visible", false);
await save();

// اسلایدر: عنوان اسلاید اول و مخفی کردن
await ad.goto(B + "/admin/site/slider");
await check("b:slides.0.visible", true);
await ad.fill('input[name="slides.0.title"]', `اسلاید تست ${run}`);
await save();
await site.goto(B + "/");
ok(await vis(site.getByRole("heading", { name: `اسلاید تست ${run}` })), "slider: first slide title on home");
await ad.goto(B + "/admin/site/slider");
await check("b:slides.0.visible", false);
await save();
await site.goto(B + "/");
ok((await site.getByText(`اسلاید تست ${run}`).count()) === 0, "slider: hidden slide not shown");

// درباره
await ad.goto(B + "/admin/site/about");
await ad.fill('input[name="title"]', `درباره‌ی تست ${run}`);
await save();
await site.goto(B + "/about");
ok(await vis(site.getByRole("heading", { level: 1, name: `درباره‌ی تست ${run}` })), "about: title from panel");

// تماس: موضوع‌های فرم
await ad.goto(B + "/admin/site/contact");
const subjects = ad.locator('[name="l:subjects"]');
await subjects.fill(`موضوع اول ${run}\nموضوع دوم ${run}`);
await save();
await site.goto(B + "/contact");
const opts = await site.locator('[name="subject"] option').allInnerTexts();
ok(opts.some((o) => o.includes(`موضوع اول ${run}`)) && opts.some((o) => o.includes(`موضوع دوم ${run}`)), "contact: subjects from panel");

// ثبت در لاگ فعالیت
ok(Number(psql("select count(*) from activity_log where action like 'site%' and created_at > now() - interval '5 minutes'")) >= 5, "site edits logged in activity log");

// ---------- پیام‌های تماس ----------
psql(`insert into contact_messages (name, mobile, subject, message) values ('پیام تست ${run}', '09121234567', 'تست', 'متن پیام تست ${run}')`);
const id = psql(`select id from contact_messages where name='پیام تست ${run}'`);
await ad.goto(B + "/admin/messages");
const row = ad
  .locator('div[class*="card"]')
  .filter({ hasText: `متن پیام تست ${run}` })
  .last();
ok(await vis(row), "messages: new message listed");
await row.getByRole("button", { name: "خوانده شد" }).click();
ok(await waitFor(() => psql(`select status from contact_messages where id='${id}'`) === "read"), "messages: mark read");
await ad.goto(B + "/admin/messages?status=read");
await ad
  .locator('div[class*="card"]')
  .filter({ hasText: `متن پیام تست ${run}` })
  .last()
  .getByRole("button", { name: "بایگانی" })
  .click();
ok(await waitFor(() => psql(`select status from contact_messages where id='${id}'`) === "archived"), "messages: archive");
await ad.goto(B + "/admin/messages?status=archived");
ok(await vis(ad.getByText(`متن پیام تست ${run}`)), "messages: archived tab");

psql("delete from site_blocks");
console.log("page errors:", errs.length ? errs : "none");
ok(!errs.length, "no JS page errors");
await b.close();
done();
process.exit();
