// گزارش‌ها، امتیاز جدیت مشتری و ورود تاریخ شمسی. داده با SQL و زمان‌های دقیق دور نیمه‌شب تهران (۰۰:۰۱ امروز، ۲۳:۵۹ دیروز).
// ⚠ همه‌ی گفتگوها، events و علاقه‌مندی‌های دیتابیس تست را پاک می‌کند؛ فقط روی دیتابیس تست جدا. آخر کار داده‌ی خودش را پاک می‌کند.
// اجرا: TEST_DB=… node tests/e2e/reports.e2e.mjs — docs/infoyaarchin.md بخش ۲۸.
import { B, admin, done, expert, launch, ok, psql, vis, waitFor } from "./lib.mjs";

const T0 = psql("select now()");
const acts = (a) => Number(psql(`select count(*) from activity_log where action='${a}' and created_at > '${T0}'`));

// ---------- داده ----------
// امروزِ تهران و لحظه‌های مرزی: ۰۰:۰۱ امروز و ۲۳:۵۹ دیروز (به وقت تهران)
const today = psql("select (now() at time zone 'Asia/Tehran')::date");
const AT = (d, hm) => `('${d} ${hm}'::timestamp at time zone 'Asia/Tehran')`;
const yest = psql(`select ('${today}'::date - 1)`);
psql("delete from login_attempts");
psql("update settings set value='false' where key='auth.enforce_permissions'");
psql("update settings set value='true' where key='features.reports'");
for (const t of ["inquiry_supplier_events", "inquiry_suppliers", "inquiries", "sms_outbox", "conversation_flags", "conversation_reads", "chat_messages", "conversations"])
  psql(`delete from ${t}`);
psql("delete from customer_signals");
psql("delete from lead_score_rules where source<>'system'");
psql("update lead_score_rules set enabled=true");
psql("delete from events");
psql("delete from favorites");
psql("delete from customer_profiles where user_id in (select id from users where email like 'rp-%')");
psql("delete from users where email like 'rp-%@example.com'");
// کاربرهای تست‌های دیگر «ثبت‌نام تازه»ی امروز و دیروز را به هم نزنند
psql("update users set created_at = now() - interval '60 days' where created_at > now() - interval '60 days'");
const custRole = psql("select id from roles where key='customer'");
// ۳۵ مشتری؛ «A» قدیمی‌ترین است (پس در مرتب‌سازی «جدیدترین» در صفحه‌ی ۲ می‌افتد)
for (let i = 0; i < 35; i++) {
  const name = i === 0 ? "RP Alpha" : i === 1 ? "RP Beta" : `RP Filler ${i}`;
  psql(`insert into users (full_name, email, created_at) values ('${name}', 'rp-${i}@example.com', now() - interval '${40 - i} days')`);
  psql(`insert into user_roles (user_id, role_id) select id, '${custRole}' from users where email='rp-${i}@example.com'`);
}
// ثبت‌نام امروز (برای «ثبت‌نام تازه»)
psql(`update users set created_at = ${AT(today, "00:01")} where email='rp-34@example.com'`);
psql(`update users set created_at = ${AT(yest, "23:59")} where email='rp-33@example.com'`);
const A = psql("select id from users where email='rp-0@example.com'"),
  Bt = psql("select id from users where email='rp-1@example.com'");
const prods = psql("select id from products where status='published' order by slug limit 14").split("\n");
// A: ۱۲ علاقه‌مندی (سقف ۲۵)، ۵ محصول متفاوت دیده‌شده، ۲ روز بازدید، پروفایل کامل، ۱ گفتگو، ۱ درخواست
for (const p of prods.slice(0, 12)) psql(`insert into favorites (user_id, product_id) values ('${A}', '${p}')`);
for (const [i, p] of prods.slice(0, 5).entries())
  psql(
    `insert into events (type, user_id, entity_type, entity_id, occurred_at) values ('product_view', '${A}', 'product', '${p}', ${i < 3 ? AT(today, "00:01") : AT(yest, "23:59")})`,
  );
psql(`insert into events (type, user_id, occurred_at) values ('site_visit', '${A}', ${AT(today, "00:01")}), ('site_visit', '${A}', ${AT(yest, "23:59")})`);
psql(
  `insert into events (type, user_id, entity_type, entity_id, occurred_at) values ('favorite_add', '${A}', 'product', '${prods[0]}', ${AT(today, "00:01")}), ('favorite_add', '${Bt}', 'product', '${prods[0]}', ${AT(today, "00:02")}), ('favorite_add', '${Bt}', 'product', '${prods[1]}', ${AT(yest, "23:59")})`,
);
// بازدید B فقط دیروز ۲۳:۵۹ (مرز روز)
psql(`insert into events (type, user_id, entity_type, entity_id, occurred_at) values ('product_view', '${Bt}', 'product', '${prods[0]}', ${AT(yest, "23:59")})`);
psql(`insert into customer_profiles (user_id, business_type, city, has_import_experience) values ('${A}', 'shop', 'تهران', true)`);
// B: ۳ علاقه‌مندی = ۱۵
for (const p of prods.slice(0, 3)) psql(`insert into favorites (user_id, product_id) values ('${Bt}', '${p}')`);
// گفتگوی A: پیام مشتری ۰۰:۰۵ امروز، ارجاع به کارشناس، پاسخ کارشناس ۱۰ دقیقه بعد، و یک درخواست
const EXPERT = psql("select id from users where email='expert@test.local'"),
  ADMIN = psql("select id from users where email='admin@test.local'");
const convA = psql(
  `insert into conversations (customer_id, kind, subject, status, assigned_to, created_at, last_message_at, last_customer_message_at) values ('${A}', 'general', 'r', 'open', '${EXPERT}', ${AT(today, "00:05")}, ${AT(today, "00:15")}, ${AT(today, "00:05")}) returning id`,
).split("\n")[0];
psql(
  `insert into chat_messages (conversation_id, sender_type, sender_user_id, kind, body, created_at) values ('${convA}', 'customer', '${A}', 'text', 'سلام', ${AT(today, "00:05")})`,
);
psql(
  `insert into chat_messages (conversation_id, sender_type, sender_user_id, kind, body, visible_to_customer, meta, created_at) values ('${convA}', 'system', '${ADMIN}', 'event', 'ارجاع', false, '{"event":"assign","to":"${EXPERT}","from":null,"by":"${ADMIN}"}', ${AT(today, "00:06")})`,
);
psql(
  `insert into chat_messages (conversation_id, sender_type, sender_user_id, kind, body, created_at) values ('${convA}', 'staff', '${EXPERT}', 'text', 'سلام، در خدمتم', ${AT(today, "00:15")})`,
);
psql(`insert into inquiries (conversation_id, product_title, created_by, created_at) values ('${convA}', 'تست', '${EXPERT}', ${AT(today, "00:20")})`);
// گفتگوی B: بی‌پاسخ و ارجاع‌نشده
const convB = psql(
  `insert into conversations (customer_id, kind, subject, status, created_at, last_message_at, last_customer_message_at) values ('${Bt}', 'general', 'r', 'open', ${AT(today, "00:30")}, ${AT(today, "00:30")}, ${AT(today, "00:30")}) returning id`,
).split("\n")[0];
psql(
  `insert into chat_messages (conversation_id, sender_type, sender_user_id, kind, body, created_at) values ('${convB}', 'customer', '${Bt}', 'text', 'قیمت؟', ${AT(today, "00:30")})`,
);

const { b, errs, page } = await launch();
async function login(fn) {
  const p = await page();
  await fn(p);
  return p;
}
const ad = await login(admin);
// کارت یک عدد: والدِ برچسب (کلاس‌های CSS module در build هش می‌شوند و «kpi» با «kpis» هم جور می‌شود)
const kpi = async (p, title) => (await p.locator('span[class*="kpiLabel"]').getByText(title, { exact: true }).first().locator("..").innerText()).replace(/\n/g, " ");

// ---------- ۱. مرز روزها و مقایسه ----------
await ad.goto(B + "/admin/reports?range=today");
let k = await kpi(ad, "بازدید محصول");
// امروز: ۳ بازدید A در ۰۰:۰۱؛ دیروز: ۲ بازدید A و ۱ بازدید B در ۲۳:۵۹
ok(k.includes("۳") && k.includes("قبل: ۳"), `today views=3 (00:01), prev=yesterday 23:59 = 3: ${k}`);
ok(k.includes("بدون تغییر"), "delta: no change");
k = await kpi(ad, "ثبت‌نام تازه");
ok(k.includes("۱") && k.includes("قبل: ۱") && k.includes("بدون تغییر"), `signups today 1 vs yesterday 1: ${k}`);
k = await kpi(ad, "افزودن به علاقه‌مندی");
ok(k.includes("۲") && k.includes("قبل: ۱"), `favorite adds 2 vs 1: ${k}`);
k = await kpi(ad, "بازدیدکننده‌ی یکتا (مشتری واردشده)");
ok(k.startsWith("بازدیدکننده‌ی یکتا (مشتری واردشده) ۱"), `unique visitors today = 1 (A): ${k}`);
await ad.goto(B + "/admin/reports?range=yesterday");
ok((await kpi(ad, "بازدید محصول")).startsWith("بازدید محصول ۳"), "yesterday views = 3 (23:59 counted in yesterday)");
ok((await kpi(ad, "بازدیدکننده‌ی یکتا (مشتری واردشده)")).includes("۲"), "yesterday unique visitors = 2");
await ad.goto(B + "/admin/reports?range=7d");
ok((await kpi(ad, "بازدید محصول")).startsWith("بازدید محصول ۶"), "7 days = 6 views");
// ---------- ۲. بخش‌ها ----------
await ad.goto(B + "/admin/reports?range=today");
ok(await vis(ad.locator("section", { hasText: "مشتری‌های تازه" }).getByRole("link", { name: "RP Filler 34" })), "new customers list with link");
ok((await ad.locator("section", { hasText: "پربازدیدترین محصولات" }).locator("tbody tr").count()) === 3, "top products (3 today)");
const chatSec = ad.locator("section", { hasText: "گفتگوها (وضعیت همین حالا)" });
ok(
  (await chatSec.locator(`a[href="/admin/chats/${convB}"]`).count()) === 1 && (await chatSec.locator(`a[href="/admin/chats/${convA}"]`).count()) === 0,
  "unanswered: B listed with link, answered A not",
);
ok((await kpi(ad, "باز و ارجاع‌نشده")).includes("۱"), "unassigned open = 1");
const staffRow = ad.locator("section", { hasText: "عملکرد کارشناس‌ها" }).locator("tr", { hasText: "Test Expert" });
const st = (await staffRow.innerText()).replace(/\s+/g, " ");
ok(st.includes("۱۰ دقیقه") && st.includes("۱۰۰٪"), `expert: first response 10 min, conversion 100% (${st})`);
ok(await vis(ad.getByText("بعد از راه‌اندازی هوش مصنوعی فعال می‌شود")), "AI placeholder");
// ---------- ۳. امتیاز جدیت ----------
// A: علاقه‌مندی ۱۲×۵=۶۰←۲۵، روز بازدید ۲×۳=۶، محصول ۵×۱=۵، پروفایل ۱۰، گفتگو ۱۰، درخواست ۲۰ = ۷۶
const leads = ad.locator("section", { hasText: "مشتری‌های با امتیاز بالا" });
ok((await leads.locator("tr").first().innerText()).includes("RP Alpha") && (await leads.locator("tr").first().innerText()).includes("۷۶"), "top lead A = 76");
ok(
  (await leads.locator("tr").nth(1).innerText()).includes("RP Beta") && (await leads.locator("tr").nth(1).innerText()).includes("۲۶"),
  "second B = 26 (favorites 15 + chat 10 + product 1)",
);
await ad.goto(B + `/admin/customers/${A}`);
ok(await vis(ad.getByText("امتیاز جدیت:")), "customer page: score card");
const bd = (await ad.locator('div[class*="card"]', { has: ad.getByText("امتیاز جدیت:") }).innerText()).replace(/\s+/g, " ");
ok(bd.includes("۷۶") && bd.includes("سقف ۲۵") && bd.includes("از ۱۴۰"), `breakdown 76 of 140 (${bd.slice(0, 120)})`);
// لیست مشتریان: مرتب‌سازی روی همه
await ad.goto(B + "/admin/customers");
ok((await ad.getByRole("columnheader", { name: "امتیاز جدیت" }).count()) === 1, "customers list: score column");
ok((await ad.getByRole("link", { name: "RP Alpha" }).count()) === 0, "default sort (newest): A not on page 1");
await ad.goto(B + "/admin/customers?sort=score");
ok((await ad.locator("tbody tr").first().innerText()).includes("RP Alpha"), "sort by score over ALL customers: A first on page 1");
await ad.goto(B + "/admin/customers?minScore=30");
ok((await ad.locator("tbody tr").count()) === 1 && (await ad.getByText("با امتیاز ۳۰ یا بیشتر").count()) === 1, "minScore filter (only A)");
// ویرایش قانون: خاموش کردن «درخواست» ← ۵۶
await ad.goto(B + "/admin/reports/scoring");
const inq = ad.locator('div[class*="card"]', { has: ad.getByRole("heading", { name: /درخواست مشتری/ }) });
await inq.getByLabel("روشن").uncheck();
await inq.getByRole("button", { name: "ذخیره" }).click();
ok(await vis(inq.getByText("ذخیره شد.")), "rule saved");
ok(acts("lead_rule.update") === 1, "rule change logged");
await ad.goto(B + "/admin/reports?range=today");
ok((await leads.locator("tr").first().innerText()).includes("۵۶"), "rule off: A = 56");
psql("update lead_score_rules set enabled=true where key='inquiries'");
// قانون تازه از نوع «نشانه» (جای AI)
await ad.goto(B + "/admin/reports/scoring");
await ad.getByText("+ قانون تازه").click();
const nf = ad.locator("details", { hasText: "قانون تازه" });
await nf.locator('select[name="kind"]').selectOption("signal");
await nf.locator('input[name="signal"]').fill("orders_count");
await nf.locator('input[name="labelFa"]').fill("سفارش‌ها (AI)");
await nf.locator('input[name="points"]').fill("۵");
await nf.locator('input[name="cap"]').fill("50");
await nf.getByRole("button", { name: "افزودن" }).click();
ok(await vis(nf.getByText("قانون اضافه شد.")), "signal rule created");
psql(`insert into customer_signals (user_id, key, value_num, source) values ('${Bt}', 'orders_count', 3, 'ai')`);
await ad.goto(B + `/admin/customers/${Bt}`);
ok(/امتیاز جدیت:\s*۴۱/.test(await ad.locator("main").innerText()), "signal adds 3×5: B = 26 + 15 = 41");
// ---------- ۴. ورود تاریخ شمسی ----------
await ad.goto(B + "/admin/reports");
const todayJ = psql(`select '${today}'`);
const toFa = (s) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
// formatToParts، نه format: format سال را با era می‌دهد («1405 AP»)؛ بخش ۲۸
const parts = Object.fromEntries(
  new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" })
    .formatToParts(new Date(todayJ + "T12:00:00Z"))
    .map((x) => [x.type, x.value]),
);
const [jy, jm, jd] = [parts.year, parts.month, parts.day];
await ad.getByLabel("از تاریخ").fill(`${jy}/${jm}/${jd}`);
await ad.getByLabel("تا تاریخ").fill(toFa(`${jy}/${jm}/${jd}`));
await ad.getByRole("button", { name: "نمایش" }).click();
await ad.waitForURL(/range=custom/);
ok(new URL(ad.url()).searchParams.get("from") === today && new URL(ad.url()).searchParams.get("to") === today, "custom range: Jalali input → Gregorian ISO in URL");
ok((await kpi(ad, "بازدید محصول")).includes("۳"), "custom range = today");
await ad.getByLabel("از تاریخ").fill("1405/13/40");
ok(await ad.getByLabel("از تاریخ").evaluate((e) => !e.checkValidity()), "invalid Jalali date blocks submit");
await ad.getByLabel("از تاریخ").fill("");
await ad.locator('button[aria-label="تقویم"]').first().click();
ok(await vis(ad.getByRole("dialog", { name: "انتخاب تاریخ" })), "calendar popup opens");
await ad.getByRole("dialog").getByRole("button", { name: "امروز" }).click();
ok((await ad.getByLabel("از تاریخ").inputValue()) === toFa(`${jy}/${jm}/${jd}`), "calendar 'today' fills Jalali date");
// تاریخ نرخ ارز (قبلاً میلادی)
await ad.goto(B + "/admin/rates");
ok((await ad.getByLabel("تاریخ نرخ").inputValue()) === toFa(`${jy}/${jm}/${jd}`), "rates: date input is Jalali (default today)");
ok((await ad.locator('input[type="date"], input[type="datetime-local"]').count()) === 0, "rates page: no Gregorian date inputs left");
for (const u of ["/admin/rates/costs", "/admin/rates/tax", "/admin/rates/shipping", "/admin/rates/hs", "/admin/chats"]) {
  await ad.goto(B + u);
  ok((await ad.locator('input[type="date"], input[type="datetime-local"]').count()) === 0, `${u}: no Gregorian date inputs`);
}
// ثبت نسخه‌ی مالیات با «معتبر از» شمسی + ساعت ← ذخیره‌ی درست
await ad.goto(B + "/admin/rates/tax");
const tf = ad.locator("form", { has: ad.getByLabel("معتبر از (اختیاری؛ خالی = همین حالا)") });
await tf.getByLabel("معتبر از (اختیاری؛ خالی = همین حالا)").fill("1406/01/01");
await tf.getByLabel("ساعت (تهران)").fill("08:30");
await tf.getByRole("button").last().click();
ok(await waitFor(() => psql("select count(*) from tax_versions where valid_from = '2027-03-21 08:30+03:30'") === "1"), "tax validFrom 1406/01/01 08:30 → 2027-03-21 08:30 Tehran");
psql("delete from tax_versions where valid_from = '2027-03-21 08:30+03:30'");
// ---------- ۵. دسترسی‌ها و سوئیچ ----------
await ad.goto(B + "/admin/settings");
const row = ad.locator("div", { hasText: "بخش «گزارش‌ها» در پنل" }).last();
ok(await vis(ad.getByText("بخش «گزارش‌ها» در پنل")), "switch relabeled");
ok(!(await ad.locator('[class*="switchRow"]', { hasText: "بخش «گزارش‌ها» در پنل" }).innerText()).includes("هنوز ساخته نشده"), "switch: no 'not built' badge");
void row;
const expertRole = psql("select id from roles where key='expert'");
const saved = psql(`select coalesce(string_agg(permission_key, ','), '') from role_permissions where role_id='${expertRole}'`);
psql(`delete from role_permissions where role_id='${expertRole}'`);
psql(`insert into role_permissions (role_id, permission_key) values ('${expertRole}', 'dashboard.view')`);
psql("update settings set value='true' where key='auth.enforce_permissions'");
const ex = await login(expert);
ok((await ex.locator('nav a[href="/admin/reports"]').count()) === 0, "expert without reports.view: no nav link");
await ex.goto(B + "/admin/reports");
ok(ex.url().includes("/admin/forbidden"), "expert without reports.view: forbidden");
psql(`insert into role_permissions (role_id, permission_key) values ('${expertRole}', 'reports.view')`);
await ex.goto(B + "/admin/reports?range=today");
ok((await ex.getByText("بازدید محصول", { exact: true }).count()) === 1, "reports.view: report visible");
ok((await ex.getByRole("heading", { name: "عملکرد کارشناس‌ها" }).count()) === 0, "without reports.staff: no staff section");
await ex.goto(B + "/admin/reports/scoring");
ok((await ex.getByRole("button", { name: "ذخیره" }).count()) === 0 && (await vis(ex.getByText("دسترسی «تنظیمات و سوئیچ‌ها»"))), "rules read-only without settings.manage");
psql(`insert into role_permissions (role_id, permission_key) values ('${expertRole}', 'reports.staff')`);
await ex.goto(B + "/admin/reports?range=today");
ok((await ex.getByRole("heading", { name: "عملکرد کارشناس‌ها" }).count()) === 1, "with reports.staff: staff section");
psql("update settings set value='false' where key='features.reports'");
await ad.goto(B + "/admin");
ok((await ad.locator('nav a[href="/admin/reports"]').count()) === 0, "switch off: nav hidden (even admin)");
ok((await ad.goto(B + "/admin/reports")).status() === 404, "switch off: page 404");
psql("update settings set value='true' where key='features.reports'");
psql(`delete from role_permissions where role_id='${expertRole}'`);
if (saved) for (const k2 of saved.split(",")) psql(`insert into role_permissions (role_id, permission_key) values ('${expertRole}', '${k2}')`);
psql("update settings set value='false' where key='auth.enforce_permissions'");

// پاک‌سازی (تست‌های بعدی)
for (const t of ["inquiries", "chat_messages", "conversations"]) psql(`delete from ${t}`);
psql("delete from customer_signals");
psql("delete from lead_score_rules where source<>'system'");
psql("update lead_score_rules set enabled=true");
psql("delete from users where email like 'rp-%@example.com'");
psql("delete from events");
console.log("page errors:", errs.length ? errs : "none");
ok(!errs.length, "no JS page errors");
await b.close();
done();
process.exit();
