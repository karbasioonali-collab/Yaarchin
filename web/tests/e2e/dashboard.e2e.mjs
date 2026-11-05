// داشبورد تازه (بخش ۵۱؛ بدون migration؛ seed: یک تنظیم). سرور با دستیار زنده (mock) و AUTO_INSIGHT_HOUR=0 و DASHBOARD_CACHE_MS=0
// (run-all: MOCK_ENV). این تست خودش tests/e2e/mock-ai.mjs را بالا می‌آورد.
// اجرا: TEST_DB=postgres://…/yarchin_e2e node tests/e2e/dashboard.e2e.mjs
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { B, admin, done, expert, launch, ok, psql, setS, sleep, vis, waitFor } from "./lib.mjs";

const run = Date.now().toString(36);
const fa = (n) => Number(n).toLocaleString("fa-IR");
const tehranYmd = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const addDays = (ymd, k) => {
  const t = new Date(ymd + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + k);
  return t.toISOString().slice(0, 10);
};
const TODAY = tehranYmd();
const YDAY = addDays(TODAY, -1);
// لحظه‌ای در روز تهران (ساعت محلی تهران، +۰۳:۳۰)
const at = (ymd, hm) => `'${ymd}T${hm}:00+03:30'`;

setS("auth.enforce_permissions", false);
psql("update settings set value='true' where key='features.reports'");
setS("ai.report_insights", false);
setS("ai.report_insights_auto", false);
setS("ai.report_daily_cost_toman", 5000);
ok(psql("select value::text from settings where key='ai.report_insights_auto'") === "false", "seed: auto insight switch exists, default off");

// ---------- داده ----------
const cleanChats = () => {
  psql("delete from chat_messages where conversation_id in (select id from conversations where subject like 'dash %')");
  psql("delete from conversation_reads where conversation_id in (select id from conversations where subject like 'dash %')");
  psql("delete from conversations where subject like 'dash %'");
};
// اجرای قبلی همین تست روی همان دیتابیس (--no-setup) عددهای «دیروز» را دو برابر نکند
cleanChats();
// فهرست «الان» حداکثر ۸ تا (قدیمی‌ترین اول) است؛ گفتگوهای باز تست‌های قبلی موقتاً بسته و در پایان دوباره باز می‌شوند
const otherOpen = psql("select coalesce(string_agg(id::text, ','), '') from conversations where status='open'");
if (otherOpen) psql(`update conversations set status='closed' where id in ('${otherOpen.split(",").join("','")}')`);
const cust = (i) => {
  const email = `dash-${run}-${i}@example.com`;
  psql(`insert into users (full_name, email) values ('DashCust${run} ${i}', '${email}')`);
  psql(`insert into user_roles (user_id, role_id) select u.id, r.id from users u, roles r where u.email='${email}' and r.key='customer'`);
  return psql(`select id from users where email='${email}'`);
};
const C = [1, 2, 3, 4, 5].map(cust);
const conv = (uid, lastCust, attention = null) =>
  psql(
    `insert into conversations (customer_id, kind, subject, status, last_customer_message_at, last_message_at, attention) values ('${uid}', 'general', 'dash ${run}', 'open', ${lastCust}, ${lastCust}, ${attention ? `'${attention}'` : "null"}) returning id`,
  ).split("\n")[0];
const msg = (cid, sender, when, extra = {}) =>
  psql(
    `insert into chat_messages (conversation_id, sender_type, kind, body, visible_to_customer, meta, created_at) values ('${cid}', '${sender}', 'text', 'dash ${run}', ${extra.visible ?? true}, '${JSON.stringify(extra.meta ?? {})}', ${when})`,
  );
// A: مشتری دیروز ← دستیار جواب داد، بعد کارشناس ← هم «پاسخ دستیار» هم «پاسخ کارشناس»
const A = conv(C[0], at(YDAY, "10:00"));
msg(A, "customer", at(YDAY, "10:00"));
msg(A, "ai", at(YDAY, "10:01"), { meta: { source: "model" } });
msg(A, "staff", at(YDAY, "11:00"));
// B: دستیار به کارشناس سپرد (پیام «سپردم» جواب نیست) ← بی‌پاسخ دیروز؛ الان منتظر کارشناس (بیش از ۲ ساعت = قرمز)
const Bc = conv(C[1], at(YDAY, "12:00"), "needs_expert");
msg(Bc, "customer", at(YDAY, "12:00"));
msg(Bc, "ai", at(YDAY, "12:01"), { meta: { source: "handoff", reason: "price" } });
// C: پیام ۲۳:۵۰ دیروز، جواب کارشناس امروز ← بی‌پاسخ دیروز (عدد دیروز ثابت می‌ماند)؛ الان جواب گرفته
const Cc = conv(C[2], at(YDAY, "23:50"));
msg(Cc, "customer", at(YDAY, "23:50"));
msg(Cc, "staff", "now() - interval '1 minute'");
// D: پیام ۱۰ دقیقه پیش، بی‌جواب ← فقط «الان» (نارنجی)
const D = conv(C[3], "now() - interval '10 minutes'");
msg(D, "customer", "now() - interval '10 minutes'");
// E: پیام دیروز، فقط جواب حالت آزمایشی (مشتری نمی‌بیند) ← بی‌پاسخ
const E = conv(C[4], at(YDAY, "14:00"));
msg(E, "customer", at(YDAY, "14:00"));
msg(E, "ai", at(YDAY, "14:01"), { visible: false, meta: { source: "model", test: true } });

// بازدید: ۳ مهمان و ۲ مشتری در ۲۴ ساعت؛ مشتری اول امتیاز ۹۰ (نشانه‌ی تعداد سفارش)
psql(`insert into events (anon_id, type, occurred_at) select 'dash-${run}-' || g, 'site_visit', now() - interval '1 hour' from generate_series(1, 3) g`);
psql(`insert into events (user_id, type, occurred_at) values ('${C[0]}', 'site_visit', now() - interval '2 hours'), ('${C[1]}', 'site_visit', now() - interval '3 hours')`);
// سقف بالا تا مشتری‌های امتیازدار تست‌های قبلی جلوی این را در «۵ تای اول» نگیرند
psql("update lead_score_rules set enabled=true, points=1, cap=100000 where key='signal_order_qty'");
psql(`insert into customer_signals (user_id, key, value_num, source) values ('${C[0]}', 'order_qty', 99999, 'chat_code'), ('${C[2]}', 'order_qty', 70, 'chat_code')`);
// نرخ: دیروز و امروز دلار (در پایان پاک می‌شود تا قیمت تست‌های بعدی عوض نشود)
psql(
  `insert into exchange_rates (currency_code, kind, rate_toman, rate_date, note) values ('USD', 'market', 100000, '${YDAY}', 'dash-${run}'), ('USD', 'market', 101000, '${TODAY}', 'dash-${run}')`,
);
// هزینه: یک درخواست زنده‌ی دیروز
psql(`insert into ai_requests (purpose, mode, model, status, cost_toman, created_at) values ('chat', 'live', 'mock/primary', 'ok', 1234, ${at(YDAY, "09:00")})`);
// آزمون کامل همین حالا با همین مدل و دستورالعمل (تازه‌تر از آزمون‌های تست ai-tests که قبل از این اجرا شدند)
const PV = readFileSync(new URL("../../src/lib/ai/prompt.ts", import.meta.url), "utf8").match(/PROMPT_VERSION = "([^"]+)"/)[1];
psql(
  `insert into ai_test_runs (status, mode, scope, model, prompt_version, total, done, passed, failed, started_at, finished_at) values ('done', 'live', '{"kind":"all"}', 'mock/primary', '${PV}', 40, 40, 37, 3, now(), now())`,
);

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
await ad.goto(B + "/admin");

// ---------- ردیف اول و حذف‌ها ----------
ok((await ad.getByText("کل کاربران").count()) === 1 && (await ad.getByText("نشست فعال").count()) === 1, "first row unchanged");
ok((await ad.getByText("آخرین فعالیت‌ها").count()) === 0 && (await ad.getByText("هنوز ساخته نشده").count()) === 0, "recent activity and switches list removed");
const main = ad.locator("main");
ok(
  (await main.getByRole("link", { name: "لاگ فعالیت", exact: true }).count()) === 1 && (await main.getByRole("link", { name: "تنظیمات و سوئیچ‌ها", exact: true }).count()) === 1,
  "two small links",
);

// ---------- بازدید ----------
const v24 = psql(
  "select count(*) || '|' || count(*) filter (where user_id is null and anon_id is not null) from events where type='site_visit' and occurred_at >= now() - interval '24 hours'",
).split("|");
ok((await ad.getByTestId("visits-24h").innerText()).trim() === fa(v24[0]), `visits last 24h = ${v24[0]}`);
const split = await ad.getByTestId("visits-split").innerText();
ok(split.includes(`مهمان ${fa(v24[1])}`) && split.includes(`مشتری ${fa(v24[0] - v24[1])}`), `guest / customer split (${split})`);
const vAll = psql("select count(*) from events where type='site_visit'");
ok((await ad.getByTestId("visits-all").innerText()).includes(fa(vAll)), "all-time visits");
ok((await ad.getByTestId("guest-since").innerText()).includes("شمرده می‌شود"), "note: guest counting start date");
const pts = await ad.getByTestId("dash-visits").locator("polyline").getAttribute("points");
ok(pts.split(" ").length === 7, `7-day sparkline (${pts})`);

// ---------- گفتگوها ----------
const kp = (await ad.getByTestId("chats-yesterday").locator('span[class*="kpiValue"]').allInnerTexts()).map((x) => x.trim());
ok(kp.join(",") === [4, 1, 1, 3].map(fa).join(","), `yesterday: total 4, assistant 1, expert 1, unanswered 3 (${kp.join(",")})`);
ok((await ad.getByTestId("dash-chats").innerText()).includes("در هر دو شمرده می‌شود"), "note: one chat can count for both");
const wl = ad.getByTestId("waiting-list");
const rowOf = (name) => wl.locator("li", { hasText: name });
ok(
  (await rowOf(`DashCust${run} 2`).getAttribute("data-tone")) === "late" && (await rowOf(`DashCust${run} 2`).innerText()).includes("منتظر کارشناس"),
  "handed-off chat: waiting for expert, red (> 2 h)",
);
ok((await rowOf(`DashCust${run} 4`).getAttribute("data-tone")) === "wait", "10-minute chat: orange");
ok((await rowOf(`DashCust${run} 5`).count()) === 1, "test-mode reply is not an answer");
ok((await rowOf(`DashCust${run} 1`).count()) === 0 && (await rowOf(`DashCust${run} 3`).count()) === 0, "answered chats not waiting");
ok((await wl.locator("li").count()) <= 8, "at most 8");
ok((await rowOf(`DashCust${run} 2`).locator("a").getAttribute("href")) === `/admin/chats/${Bc}`, "link to the chat");
const bCount = psql(
  "select count(*) from conversations c where c.status='open' and c.last_customer_message_at is not null and not exists (select 1 from chat_messages r where r.conversation_id=c.id and r.created_at > c.last_customer_message_at and ((r.sender_type='ai' and r.kind='text' and r.visible_to_customer and coalesce(r.meta->>'source','')<>'handoff') or (r.sender_type='staff' and r.kind='text')))",
);
ok((await ad.getByTestId("waiting-count").innerText()).includes(fa(bCount)), `waiting count = ${bCount}`);

// ---------- مشتری‌ها ----------
const nc = psql(
  `select count(*) filter (where u.created_at < '${TODAY}T00:00:00+03:30') || '|' || count(*) filter (where u.created_at >= '${TODAY}T00:00:00+03:30') from users u join user_roles ur on ur.user_id=u.id join roles r on r.id=ur.role_id and r.key='customer' where u.created_at >= '${YDAY}T00:00:00+03:30'`,
).split("|");
ok(
  (await ad.getByTestId("new-yesterday").innerText()).trim() === fa(nc[0]) && (await ad.getByTestId("new-today").innerText()).trim() === fa(nc[1]),
  `new customers yesterday/today (${nc})`,
);
const leadRow = ad.getByTestId("dash-leads").locator("li", { hasText: `DashCust${run} 1` });
ok((await leadRow.count()) === 1 && (await leadRow.getByTestId("lead-score").getAttribute("data-tone")) === "high", "active high-score customer listed (green)");
ok(
  (await ad
    .getByTestId("dash-leads")
    .locator("li", { hasText: `DashCust${run} 3` })
    .count()) === 0,
  "score 70 but no visit in 24 h → not listed",
);
ok((await ad.getByTestId("dash-leads").locator("li").count()) <= 5, "at most 5");

// ---------- نرخ، هزینه، آزمون ----------
const usd = await ad.getByTestId("rate-USD").innerText();
ok(usd.includes(`${fa(101000)} تومان`) && usd.includes(`دیروز ${fa(100000)}`) && usd.includes("▲") && usd.includes("ثبت شده"), `USD today and yesterday (${usd})`);
const cy = psql(
  `select round(coalesce(sum(cost_toman),0)) from ai_requests where mode='live' and created_at >= '${YDAY}T00:00:00+03:30' and created_at < '${TODAY}T00:00:00+03:30'`,
);
ok((await ad.getByTestId("cost-yesterday").innerText()).trim() === fa(cy) && Number(cy) >= 1234, `AI cost yesterday = ${cy}`);
ok((await ad.getByTestId("cost-all").innerText()).trim() === fa(psql("select round(coalesce(sum(cost_toman),0)) from ai_requests where mode='live'")), "AI cost all-time");
const lastTxt = await ad.getByTestId("test-last").innerText();
ok(lastTxt.includes(`${fa(37)} قبول`) && lastTxt.includes(`${fa(3)} رد از ${fa(40)}`), `last full test (${lastTxt})`);
ok((await ad.getByTestId("test-next").innerText()).includes("تا "), "next test due date (last + stale days)");
psql(`update ai_test_runs set prompt_version='old' where prompt_version='${PV}' and started_at > now() - interval '1 hour' and total=40 and passed=37`);
await ad.reload();
ok((await ad.getByTestId("test-next").innerText()).includes("همین حالا لازم است (مدل یا دستورالعمل عوض شده)"), "prompt changed → needed now");

// ---------- تحلیل خودکار ----------
ok(await vis(ad.getByTestId("insight-auto-off")), "auto insight off → note with settings link");
ok((await ad.getByTestId("dash-insight").innerText()).includes("تحلیل ۷ روز تا دیروز"), "title «تحلیل ۷ روز تا دیروز»");
// ۴۰ بازدید مهمان در ۴ روز قبل از امروز برای یک محصول
const P = psql("select id from products where status='published' order by slug limit 1");
psql(
  `insert into events (anon_id, type, entity_type, entity_id, occurred_at) select 'dashins-' || g, 'product_view', 'product', '${P}', now() - make_interval(days => 1 + g % 4) from generate_series(1, 40) g`,
);
const mock = spawn(process.execPath, [new URL("./mock-ai.mjs", import.meta.url).pathname, "3399"], { stdio: ["ignore", "ignore", "inherit"] });
process.on("exit", () => mock.kill());
await sleep(500);
const autoRows = () => psql(`select count(*) from ai_requests where purpose='report_insight' and meta->>'auto'='true' and meta->>'day'='${TODAY}'`);
psql(`delete from ai_requests where purpose='report_insight' and meta->>'auto'='true'`);
setS("ai.report_insights", true);
setS("ai.report_insights_auto", true);
ok(await waitFor(() => autoRows() === "1", 80000), "scheduler ran the auto insight once (after the hour)");
ok(
  psql(
    `select (meta->>'rangeFrom') || '|' || (meta->>'rangeTo') || '|' || status from ai_requests where purpose='report_insight' and meta->>'auto'='true' order by id desc limit 1`,
  ) === `${addDays(YDAY, -6)}|${YDAY}|ok`,
  "range: 7 days up to the end of yesterday",
);
await ad.reload();
ok((await ad.getByTestId("dash-insight-result").locator("li").count()) === 4, "dashboard shows the auto insight");
await sleep(65000);
ok(autoRows() === "1", "not repeated the same day");
// گزارش‌ها: همان بازه با «بازه‌ی دلخواه» همان نتیجه را دارد
await ad.goto(B + `/admin/reports?range=custom&from=${addDays(YDAY, -6)}&to=${YDAY}`);
ok((await ad.getByTestId("insight-result").locator("li").count()) === 4, "reports page (same range) shows the same saved insight");

// ---------- دکمه‌ی «تحلیل کن» همیشه دیده می‌شود ----------
setS("ai.report_insights", false);
await ad.goto(B + "/admin/reports?range=7d");
const offBtn = ad.getByTestId("insight").getByRole("button", { name: /تحلیل/ });
ok(
  (await offBtn.count()) === 1 && (await offBtn.isDisabled()) && (await ad.getByTestId("insight-off").getByRole("link").count()) === 1,
  "switch off → disabled button + settings link",
);
setS("ai.report_insights", true);
await ad.goto(B + "/admin/reports?range=custom&from=2026-01-01&to=2026-01-03");
const ne = await ad.getByTestId("insight-not-enough").innerText();
ok(
  ne.includes("بازدید محصول از ۳۰ لازم") && ne.includes("روز با فعالیت از ۳ لازم") && (await ad.getByTestId("insight").getByRole("button", { name: "تحلیل کن" }).isDisabled()),
  `too little data → disabled with what is missing (${ne})`,
);

// ---------- دسترسی: سوئیچ خاموش ← کارشناس همه را می‌بیند ----------
const CARDS = ["dash-visits", "dash-chats", "dash-new-customers", "dash-leads", "dash-rates", "dash-ai-cost", "dash-ai-tests", "dash-insight"];
const seen = async (p) => {
  const out = [];
  for (const id of CARDS) if ((await p.getByTestId(id).count()) > 0) out.push(id);
  return out.join(",");
};
psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
psql("insert into role_permissions (role_id, permission_key) select id, 'dashboard.view' from roles where key='expert'");
setS("auth.enforce_permissions", false);
const ex = await page();
await expert(ex);
await ex.goto(B + "/admin");
ok((await seen(ex)) === CARDS.join(","), `enforce off: expert sees every card (${await seen(ex)})`);
ok((await ex.getByTestId("waiting-list").count()) === 1, "enforce off: waiting list too");

// ---------- روشن ← هر کارت با دسترسی خودش ----------
setS("auth.enforce_permissions", true);
const grant = (k) => psql(`insert into role_permissions (role_id, permission_key) select id, '${k}' from roles where key='expert' on conflict do nothing`);
await ex.reload();
ok((await seen(ex)) === "" && (await ex.getByText("کل کاربران").count()) === 1, `dashboard.view only → first row, no cards (${await seen(ex)})`);
ok((await ex.locator("main").getByRole("link", { name: "لاگ فعالیت", exact: true }).count()) === 0, "no activity link without activity.view");
const steps = [
  ["reports.visits", "dash-visits"],
  ["reports.chats", "dash-visits,dash-chats"],
  ["reports.customers", "dash-visits,dash-chats,dash-new-customers,dash-leads"],
  ["rates.enter", "dash-visits,dash-chats,dash-new-customers,dash-leads,dash-rates"],
  ["ai.costs", "dash-visits,dash-chats,dash-new-customers,dash-leads,dash-rates,dash-ai-cost"],
  ["ai.tests", "dash-visits,dash-chats,dash-new-customers,dash-leads,dash-rates,dash-ai-cost,dash-ai-tests"],
  ["reports.insight", CARDS.join(",")],
];
for (const [k, want] of steps) {
  grant(k);
  await ex.reload();
  const got = await seen(ex);
  ok(got === want, `${k} → ${want} (${got})`);
  if (k === "reports.chats")
    ok((await ex.getByTestId("chats-yesterday").count()) === 1 && (await ex.getByTestId("waiting-list").count()) === 0, "reports.chats: yesterday stats, no live list");
}
grant("chats.view_all");
await ex.reload();
ok((await ex.getByTestId("waiting-list").count()) === 1, "chats.view_all → live waiting list");
// کارت چت فقط با فهرست الان
psql("delete from role_permissions where role_id=(select id from roles where key='expert') and permission_key='reports.chats'");
await ex.reload();
ok((await ex.getByTestId("dash-chats").count()) === 1 && (await ex.getByTestId("chats-yesterday").count()) === 0, "chats.view_all only → card with live list, no yesterday stats");
const ad2 = await page();
await admin(ad2);
await ad2.goto(B + "/admin");
ok((await seen(ad2)) === CARDS.join(","), "admin (enforce on) sees every card");

// ---------- موبایل ۳۶۰ پیکسل ----------
await ad2.setViewportSize({ width: 360, height: 760 });
await ad2.reload();
const sw = await ad2.evaluate(() => document.documentElement.scrollWidth);
ok(sw <= 362, `no horizontal scroll at 360 px (scrollWidth ${sw})`);
const w = await ad2.getByTestId("dash-chats").evaluate((e) => e.getBoundingClientRect().width);
ok(w <= 360, `card fits the screen (${Math.round(w)} px)`);

// ---------- پاک‌سازی ----------
psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
psql("insert into role_permissions (role_id, permission_key) select id, 'dashboard.view' from roles where key='expert'");
setS("auth.enforce_permissions", false);
setS("ai.report_insights_auto", false);
setS("ai.report_insights", false);
psql("update lead_score_rules set enabled=false, points=0.01, cap=20 where key='signal_order_qty'");
psql(`delete from exchange_rates where note='dash-${run}'`);
psql(`delete from events where anon_id like 'dash-${run}-%' or anon_id like 'dashins-%' or user_id in ('${C.join("','")}')`);
psql(`delete from customer_signals where user_id in ('${C.join("','")}')`);
cleanChats();
if (otherOpen) psql(`update conversations set status='open' where id in ('${otherOpen.split(",").join("','")}')`);
await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
