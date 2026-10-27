// پیگیری کارخانه‌ها و پیامک هشدار گفتگو (حالت آزمایشی پیامک): گفتگوی تازه، خاموش شخصی، روز کاری، ارجاع، یادآوری (زمان‌بند ۶۰ ثانیه‌ای)،
// صفحه‌ی پیامک‌ها و قاعده‌ها؛ درخواست مشتری، وضعیت کارخانه‌ها و مکاتبه، افزودن دستی، نماهای ادمین، پوشاندن اسم کارخانه، نوار اعلان،
// و seed-demo --remove (آخر کار داده‌ی نمونه دوباره ساخته می‌شود). حدود ۳ دقیقه. اجرا: TEST_DB=… node tests/e2e/followup.e2e.mjs — docs/infoyaarchin.md بخش ۲۵.
import { execFileSync } from "node:child_process";
import { B, DB, admin, api, customer, done, expert, launch, ok, psql, setS, sleep, vis, waitFor } from "./lib.mjs";

const run = Date.now().toString(36);
const AD_MOB = "09121110001";
const EX_MOB = "09121110002";
setS("features.chat", true);
setS("features.ai_agent", false);
setS("auth.enforce_permissions", false);
setS("sms.work_start", "00:00");
setS("sms.work_end", "23:59");
setS("sms.work_days", [0, 1, 2, 3, 4, 5, 6]);
setS("sms.chat_cooldown_minutes", 30);
setS("sms.reminder_minutes", 1);
psql(`update users set mobile='${AD_MOB}' where email='admin@test.local'`);
psql(`update users set mobile='${EX_MOB}' where email='expert@test.local'`);
psql("delete from staff_notification_prefs");
const hadReply = psql("select count(*) from role_permissions rp join roles r on r.id=rp.role_id where r.key='expert' and rp.permission_key='chats.reply'") !== "0";
if (!hadReply) psql("insert into role_permissions (role_id, permission_key) select id, 'chats.reply' from roles where key='expert'");
const sms = (conv, extra = "") => psql(`select count(*) from sms_outbox where conversation_id='${conv}' ${extra}`);

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
const ex = await page();
await expert(ex);
let n = 0;
const newChat = async (slug = "steel-cookware-set-10") => {
  const c = await page();
  await customer(c, `fu-${run}-${++n}@example.com`, `Followup ${n}`);
  const r = await api(c, "POST", "/api/v1/chat", { product: slug, message: `سلام، سؤال پیگیری ${run}-${n}` });
  return { c, conv: r.j.conversation.id };
};

// ---------- پیامک گفتگوی تازه ----------
const A = await newChat();
ok(await waitFor(() => sms(A.conv, `and kind='chat_new' and to_mobile='${AD_MOB}' and status='test'`) === "1"), "new chat → test SMS to admin");
ok(await waitFor(() => sms(A.conv, `and kind='chat_new' and to_mobile='${EX_MOB}'`) === "1"), "permissions off → expert also alerted");
ok(psql(`select body from sms_outbox where conversation_id='${A.conv}' and to_mobile='${AD_MOB}'`).includes("/admin/chats/"), "SMS body has panel link");

// خاموش شخصی (کارشناس)
await ex.goto(B + "/admin/account");
await ex.getByLabel("پیامک هشدار گفتگو برای من فرستاده شود").uncheck();
await ex
  .locator("form", { has: ex.locator('input[name="smsEnabled"]') })
  .getByRole("button", { name: "ذخیره" })
  .click();
ok(
  await waitFor(() => psql("select sms_enabled::text from staff_notification_prefs p join users u on u.id=p.user_id where u.email='expert@test.local'") === "false"),
  "expert turns own SMS off",
);
const B2 = await newChat();
await waitFor(() => sms(B2.conv, `and to_mobile='${AD_MOB}'`) === "1");
ok(sms(B2.conv, `and to_mobile='${EX_MOB}'`) === "0", "personal off → expert gets no SMS");
psql("delete from staff_notification_prefs");

// خارج از روز کاری
const dow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tehran" })).getDay();
setS(
  "sms.work_days",
  [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== dow),
);
const C = await newChat();
ok((await waitFor(() => sms(C.conv, "and status='skipped'") !== "0")) && sms(C.conv, "and status='test'") === "0", "outside work days → skipped");
setS("sms.work_days", [0, 1, 2, 3, 4, 5, 6]);

// ارجاع (همیشه، حتی در بازه‌ی فاصله)
await ad.goto(B + `/admin/chats/${A.conv}`);
const af = ad.locator("form", { has: ad.locator('select[name="to"]') });
await af.locator('select[name="to"]').selectOption({ label: "Test Expert" });
await af.getByRole("button", { name: "ارجاع", exact: true }).click();
ok(await waitFor(() => sms(A.conv, `and kind='chat_assigned' and to_mobile='${EX_MOB}'`) === "1"), "assign → SMS to expert despite cooldown");

// یادآوری: در بازه‌ی فاصله نمی‌رود؛ بعد از پاک کردن صف همان گفتگو، زمان‌بند (۶۰ ثانیه) می‌فرستد
await api(A.c, "POST", `/api/v1/chat/${A.conv}`, { message: `کسی هست؟ ${run}` });
psql(`update chat_messages set created_at = now() - interval '2 minutes' where conversation_id='${A.conv}' and sender_type='customer'`);
psql(`update conversations set last_customer_message_at = now() - interval '2 minutes' where id='${A.conv}'`);
await sleep(70000);
ok(sms(A.conv, "and kind='chat_reminder'") === "0", "reminder blocked by cooldown");
psql(`delete from sms_outbox where conversation_id='${A.conv}'`);
ok(await waitFor(() => sms(A.conv, `and kind='chat_reminder' and to_mobile='${EX_MOB}'`) === "1", 75000), "unanswered → reminder to assigned expert");

// صفحه‌ی پیامک‌ها و تنظیمات
await ad.goto(B + "/admin/sms");
ok((await vis(ad.getByText(AD_MOB).first())) && (await vis(ad.getByText("آزمایشی").first())), "/admin/sms lists test SMS");
await ad.goto(B + "/admin/chats/settings");
await ad.locator('input[name="cooldown"]').fill("45");
await ad
  .locator("form", { has: ad.locator('input[name="cooldown"]') })
  .getByRole("button", { name: "ذخیره" })
  .click();
ok(await waitFor(() => psql("select value from settings where key='sms.chat_cooldown_minutes'") === "45"), "chat settings: cooldown saved");
setS("sms.chat_cooldown_minutes", 30);
await ad.goto(B + "/admin/chats");
ok(await vis(ad.getByText(/فعال‌سازی اعلان و صدا/)), "notification banner on chats page");

// ---------- درخواست مشتری و پیگیری کارخانه‌ها ----------
await ad.goto(B + `/admin/chats/${B2.conv}`);
await ad.getByText("ساخت درخواست تازه").click();
await ad.locator('input[name="qty"]').fill("300");
await ad.locator('textarea[name="note"]').fill(`یادداشت درخواست ${run}`);
await ad.getByRole("button", { name: "ساخت درخواست" }).click();
ok(await waitFor(() => psql(`select count(*) from inquiries where conversation_id='${B2.conv}'`) === "1"), "inquiry created from chat");
const inq = psql(`select id from inquiries where conversation_id='${B2.conv}'`);
const listings = psql(
  `select count(distinct l.company_id) from product_listings l join companies co on co.id=l.company_id join products p on p.id=l.product_id where p.slug='steel-cookware-set-10' and l.status='active' and co.status='active'`,
);
ok(psql(`select count(*) from inquiry_suppliers where inquiry_id='${inq}' and status='pending'`) === listings, `suppliers auto-added from active listings (${listings})`);
ok(psql(`select count(*) from chat_messages where conversation_id='${B2.conv}' and kind='event' and not visible_to_customer`) !== "0", "internal event in chat");
const cv = await api(B2.c, "GET", `/api/v1/chat/${B2.conv}`);
ok(!JSON.stringify(cv.j).includes("درخواست"), "customer does not see inquiry event");

await ad.goto(B + `/admin/inquiries/${inq}`);
const firstSup = ad.locator("form", { has: ad.locator('input[name="supplierId"]') }).first();
const supId = await firstSup.locator('input[name="supplierId"]').inputValue();
await firstSup.getByLabel("وضعیت").selectOption("contacted");
await firstSup.getByLabel("یادداشت").fill(`پیام دادم ${run}`);
await firstSup.getByRole("button", { name: "ثبت" }).click();
ok(await waitFor(() => psql(`select status from inquiry_suppliers where id='${supId}'`) === "contacted"), "supplier status → contacted");
ok(
  psql(
    `select direction from company_correspondence where id=(select correspondence_id from inquiry_supplier_events where inquiry_supplier_id='${supId}' order by created_at desc limit 1)`,
  ) === "outbound",
  "contacted → outbound correspondence row",
);
await ad.reload();
const f2 = ad.locator("form", { has: ad.locator(`input[name="supplierId"][value="${supId}"]`) });
await f2.getByLabel("وضعیت").selectOption("quoted");
await f2.getByLabel("یادداشت").fill("۱۲ دلار FOB");
await f2.getByRole("button", { name: "ثبت" }).click();
ok(await waitFor(() => psql(`select count(*) from inquiry_supplier_events where inquiry_supplier_id='${supId}'`) === "2"), "event history append-only");
ok(
  psql(
    `select direction from company_correspondence where id=(select correspondence_id from inquiry_supplier_events where inquiry_supplier_id='${supId}' order by created_at desc limit 1)`,
  ) === "inbound",
  "quoted → inbound correspondence",
);
// افزودن دستی
await ad.reload();
const addSel = ad.locator('select[name="companyId"]');
const optCount = await addSel.locator("option").count();
if (optCount > 1) {
  await addSel.selectOption({ index: 1 });
  await ad.getByRole("button", { name: "افزودن" }).click();
  ok(await waitFor(() => Number(psql(`select count(*) from inquiry_suppliers where inquiry_id='${inq}'`)) === Number(listings) + 1), "manual supplier added");
}
// وضعیت درخواست
await ad.locator('select[name="status"]').first().selectOption("done");
await ad.getByRole("button", { name: "ذخیره‌ی وضعیت" }).click();
ok(await waitFor(() => psql(`select status from inquiries where id='${inq}'`) === "done"), "inquiry status → done");
// نماهای ادمین
await ad.goto(B + "/admin/inquiries");
ok(await vis(ad.locator(`a[href="/admin/inquiries/${inq}"]`)), "inquiries list");
await ad.goto(B + "/admin/inquiries?view=activity");
ok(await vis(ad.getByText("قیمت گرفته شد").first()), "activity tab shows supplier events");

// پوشاندن اسم کارخانه برای کارشناس بدون companies.view
await ad.goto(B + `/admin/chats/${B2.conv}`);
const af2 = ad.locator("form", { has: ad.locator('select[name="to"]') });
await af2.locator('select[name="to"]').selectOption({ label: "Test Expert" });
await af2.getByRole("button", { name: "ارجاع", exact: true }).click();
await waitFor(() => psql(`select assigned_to=(select id from users where email='expert@test.local') from conversations where id='${B2.conv}'`) === "t");
setS("auth.enforce_permissions", true);
await ex.goto(B + `/admin/inquiries/${inq}`);
const exText = await ex.locator("main").innerText();
const names = psql(`select string_agg(co.name_en, '|') from inquiry_suppliers s join companies co on co.id=s.company_id where s.inquiry_id='${inq}'`).split("|");
ok(exText.includes("کارخانه‌ی ۱") && !names.some((x) => exText.includes(x)), "expert sees «کارخانه‌ی ۱», not factory names");
ok((await ex.locator('input[name="supplierId"]').count()) === 0, "expert cannot change supplier status");
setS("auth.enforce_permissions", false);

// ---------- seed-demo --remove: درخواست با اسم محصول ذخیره‌شده می‌ماند ----------
const web = new URL("../..", import.meta.url).pathname;
execFileSync("npm", ["run", "-s", "db:seed-demo", "--", "--remove"], { cwd: web, env: { ...process.env, DATABASE_URL: DB }, stdio: "pipe" });
ok(
  psql(`select product_title from inquiries where id='${inq}'`).length > 0 && psql(`select count(*) from inquiry_suppliers where inquiry_id='${inq}'`) === "0",
  "seed-demo --remove keeps inquiry (with stored title), drops demo suppliers",
);
execFileSync("npm", ["run", "-s", "db:seed-demo"], { cwd: web, env: { ...process.env, DATABASE_URL: DB }, stdio: "pipe" });
ok(psql("select count(*) from products where status='published'") !== "0", "demo data re-created");

if (!hadReply) psql("delete from role_permissions where permission_key='chats.reply' and role_id=(select id from roles where key='expert')");
setS("sms.reminder_minutes", 15);
console.log("page errors:", errs.length ? errs : "none");
ok(!errs.length, "no JS page errors");
await b.close();
done();
process.exit();
