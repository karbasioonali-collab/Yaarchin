// دسترسی‌های ریز گزارش‌ها و صفحه‌ی مشتریان (بخش ۵۰؛ بدون migration؛ seed: ۶ دسترسی + یک بار دادن ۴ دسترسی بخش گزارش).
// اجرا: TEST_DB=postgres://…/yarchin_e2e node tests/e2e/perms.e2e.mjs
import { execFileSync } from "node:child_process";
import { B, DB, admin, customer, done, expert, launch, ok, psql, setS, sleep } from "./lib.mjs";

const run = Date.now().toString(36);
const seedRun = () => execFileSync(process.execPath, ["scripts/seed.mjs"], { env: { ...process.env, DATABASE_URL: DB }, stdio: "pipe" });
psql("update settings set value='true' where key='features.reports'");

// ---------- seed ----------
ok(
  psql("select count(*) from permissions where key in ('reports.visits','reports.products','reports.chats','reports.customers','reports.insight','ai.costs')") === "6",
  "6 new permissions",
);
ok(
  psql("select group_key from permissions where key='reports.insight'") === "insight" && psql("select group_key from permissions where key='ai.costs'") === "ai_costs",
  "own groups",
);
ok(psql("select count(*) from activity_log where action='seed.grant_report_sections'") === "1", "one-time grant ran once");
// نقشی با reports.view ← یک بار ۴ دسترسی بخش‌ها؛ insight و costs نه
psql(`insert into roles (key, name_fa, name_en, is_staff) values ('rep${run}', 'گزارش‌خوان ${run}', 'Reporter ${run}', true)`);
psql(`insert into role_permissions (role_id, permission_key) select id, 'reports.view' from roles where key='rep${run}'`);
psql("delete from activity_log where action='seed.grant_report_sections'");
seedRun();
const permsOf = () => psql(`select string_agg(permission_key, ',' order by permission_key) from role_permissions where role_id=(select id from roles where key='rep${run}')`);
ok(permsOf() === "reports.chats,reports.customers,reports.products,reports.view,reports.visits", `role with reports.view got the 4 section permissions (${permsOf()})`);
ok(!permsOf().includes("reports.insight") && !permsOf().includes("ai.costs"), "not insight or costs");
psql(`delete from role_permissions where role_id=(select id from roles where key='rep${run}') and permission_key='reports.chats'`);
seedRun();
ok(!permsOf().includes("reports.chats"), "seed again: removed permission not granted back (one time only)");
ok(
  psql("select count(*) from role_permissions rp join roles r on r.id=rp.role_id where r.key='expert' and rp.permission_key like 'reports.%'") === "0",
  "expert (no reports.view) got nothing",
);
ok(
  psql("select count(*) from role_permissions rp join roles r on r.id=rp.role_id where r.key='admin' and rp.permission_key in ('reports.insight','ai.costs')") === "2",
  "admin has all",
);

const { b, errs, page } = await launch();
const SECS = ["sec-products", "sec-signups", "sec-favorites", "sec-chats", "sec-leads", "insight", "sec-ai-stats"];
const seen = async (p) => {
  const out = [];
  for (const id of SECS) if ((await p.getByTestId(id).count()) > 0) out.push(id);
  return out.join(",");
};
const kpis = async (p) => (await p.locator('span[class*="kpiLabel"]').allInnerTexts()).join("|");

// ---------- auth.enforce_permissions خاموش ← مثل قبل، همه‌چیز ----------
setS("auth.enforce_permissions", false);
psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
psql("insert into role_permissions (role_id, permission_key) select id, 'dashboard.view' from roles where key='expert'");
const ex = await page();
await expert(ex);
await ex.goto(B + "/admin/reports?range=7d");
ok((await seen(ex)) === SECS.join(","), `enforce off: expert sees every section as before (${await seen(ex)})`);
ok((await kpis(ex)).includes("بازدید محصول") && (await kpis(ex)).includes("ثبت‌نام تازه") && (await kpis(ex)).includes("گفتگوی تازه"), "enforce off: all KPIs");

// ---------- روشن ← هر بخش با دسترسی خودش ----------
setS("auth.enforce_permissions", true);
const grant = (k) => psql(`insert into role_permissions (role_id, permission_key) select id, '${k}' from roles where key='expert' on conflict do nothing`);
grant("reports.view");
await ex.goto(B + "/admin/reports?range=7d");
ok((await seen(ex)) === "" && (await kpis(ex)) === "", `reports.view only → page opens, no sections (${await seen(ex)} / ${await kpis(ex)})`);
grant("reports.visits");
await ex.reload();
ok((await kpis(ex)) === "بازدید محصول|بازدیدکننده‌ی یکتا|ورود به سایت (هر نفر یک بار در روز)" && (await seen(ex)) === "", `reports.visits → visit KPIs only (${await kpis(ex)})`);
grant("reports.products");
await ex.reload();
ok(
  (await seen(ex)) === "sec-products,sec-favorites" && (await kpis(ex)).includes("افزودن به علاقه‌مندی"),
  `reports.products → top products, categories, favorites (${await seen(ex)})`,
);
grant("reports.chats");
await ex.reload();
ok(
  (await seen(ex)) === "sec-products,sec-favorites,sec-chats,sec-ai-stats" && (await kpis(ex)).includes("درخواست مشتری"),
  `reports.chats → chats and assistant stats (${await seen(ex)})`,
);
grant("reports.customers");
await ex.reload();
ok(
  (await seen(ex)) === "sec-products,sec-signups,sec-favorites,sec-chats,sec-leads,sec-ai-stats" && (await kpis(ex)).includes("ثبت‌نام تازه"),
  `reports.customers → signups and leads (${await seen(ex)})`,
);
ok((await ex.getByTestId("insight").count()) === 0, "no reports.insight → no insight card");
grant("reports.insight");
await ex.reload();
ok((await ex.getByTestId("insight").count()) === 1, "reports.insight → insight card");
// فهرست مشتریان: ستون امتیاز و نشانه فقط با reports.customers
grant("customers.view");
psql("delete from role_permissions where role_id=(select id from roles where key='expert') and permission_key='reports.customers'");
await ex.goto(B + "/admin/customers");
ok(
  (await ex.locator("th", { hasText: "امتیاز جدیت" }).count()) === 0 && (await ex.locator("th", { hasText: "آخرین نشانه" }).count()) === 0,
  "customers list without reports.customers: no score or signal column",
);
ok((await ex.locator("th", { hasText: "آخرین فعالیت" }).count()) === 1, "last activity column for everyone with customers.view");
grant("reports.customers");
await ex.reload();
ok((await ex.locator("th", { hasText: "امتیاز جدیت" }).count()) === 1, "with reports.customers: score column");
// مدیر همیشه همه
const ad = await page();
await admin(ad);
await ad.goto(B + "/admin/reports?range=7d");
ok((await seen(ad)) === SECS.join(","), "admin (enforce on) sees everything");
await ad.goto(B + `/admin/roles/${psql("select id from roles where key='expert'")}`);
const rolesTxt = await ad.locator("main").innerText();
ok(rolesTxt.includes("تحلیل هوشمند") && rolesTxt.includes("هزینه‌ی هوش مصنوعی") && rolesTxt.includes("گزارش بازدیدها"), "roles page: new groups with Persian names");

// ---------- صفحه‌ی مشتریان: امتیاز، فیلتر سریع، ستون‌ها، رنگ ----------
{
  setS("auth.enforce_permissions", false);
  psql("update lead_score_rules set enabled=true, points=1, cap=100 where key='signal_order_qty'");
  const ids = [];
  for (const [i, qty] of [
    [1, 90],
    [2, 60],
    [3, 10],
  ]) {
    const c = await page();
    const id = await customer(c, `perm-${run}-${i}@example.com`, `PermCust${run} ${i}`);
    await c.close();
    psql(
      `insert into customer_signals (user_id, key, value_num, source) values ('${id}', 'order_qty', ${qty}, 'chat_code') on conflict (user_id, key) do update set value_num = excluded.value_num`,
    );
    ids.push(id);
  }
  psql(`delete from events where user_id in ('${ids.join("','")}')`);
  psql(`insert into events (user_id, type, occurred_at) values ('${ids[1]}', 'site_visit', now() - interval '3 hours'), ('${ids[1]}', 'customer_signal', now())`);
  const q = encodeURIComponent(`PermCust${run}`);
  await ad.goto(B + `/admin/customers?q=${q}`);
  const names = await ad.locator("tbody tr td:first-child a").allInnerTexts();
  ok(names.join(",") === `PermCust${run} 1,PermCust${run} 2,PermCust${run} 3`, `default: highest score first (${names.join(",")})`);
  const tones = await ad.getByTestId("score").evaluateAll((els) => els.map((e) => e.getAttribute("data-tone")));
  ok(tones.join(",") === "high,mid,low", `score colors (${tones.join(",")})`);
  const green = await ad
    .getByTestId("score")
    .first()
    .evaluate((e) => getComputedStyle(e).color);
  ok(green === "rgb(47, 125, 92)", `≥80 green (${green})`);
  const sig = await ad.getByTestId("last-signal").allInnerTexts();
  ok(sig.join(",") === "۹۰ عدد,۶۰ عدد,۱۰ عدد", `last signal column (${sig.join(",")})`);
  const act = await ad.getByTestId("last-activity").allInnerTexts();
  ok(act[0].trim() === "—" && act[1].trim() !== "—", `last activity: real site events only, not signals (${act.join(" / ")})`);
  await ad.getByTestId("score-filters").getByRole("link", { name: "بالای ۵۰" }).click();
  await ad.waitForURL(/minScore=50/);
  ok((await ad.locator("tbody tr td:first-child a").count()) === 2 && ad.url().includes(`q=${q}`), "quick filter «بالای ۵۰» (search kept)");
  await ad.getByTestId("score-filters").getByRole("link", { name: "بالای ۸۰" }).click();
  await ad.waitForURL(/minScore=80/);
  ok((await ad.locator("tbody tr td:first-child a").count()) === 1, "quick filter «بالای ۸۰»");
  await ad.getByTestId("score-filters").getByRole("link", { name: "همه" }).click();
  await ad.waitForURL((u) => !u.searchParams.has("minScore"));
  ok((await ad.locator("tbody tr td:first-child a").count()) === 3, "quick filter «همه»");
  await ad.goto(B + `/admin/customers?q=${q}&sort=new`);
  ok((await ad.locator("tbody tr td:first-child a").allInnerTexts()).join(",") === `PermCust${run} 3,PermCust${run} 2,PermCust${run} 1`, "sort=new → newest first");
  psql("update lead_score_rules set enabled=false, points=0.01, cap=20 where key='signal_order_qty'");
}

// پاک‌سازی
psql(`delete from role_permissions where role_id=(select id from roles where key='rep${run}')`);
psql(`delete from roles where key='rep${run}'`);
psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
psql("insert into role_permissions (role_id, permission_key) select id, 'dashboard.view' from roles where key='expert'");
setS("auth.enforce_permissions", false);
await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
