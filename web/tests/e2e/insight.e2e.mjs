// «تحلیل هوشمند» گزارش‌ها (بدون migration؛ seed: دو تنظیم). docs/infoyaarchin.md بخش ۴۹.
// سرور با دستیار زنده (AI_BASE_URL=http://127.0.0.1:3399/v1 …؛ این تست خودش tests/e2e/mock-ai.mjs را بالا می‌آورد).
// اجرا: TEST_DB=postgres://…/yarchin_e2e node tests/e2e/insight.e2e.mjs
import { spawn } from "node:child_process";
import { B, admin, done, expert, launch, ok, psql, setS, sleep, vis, waitFor } from "./lib.mjs";

const MOCK = "http://127.0.0.1:3399";
setS("auth.enforce_permissions", false);
psql("update settings set value='true' where key='features.reports'");
setS("ai.report_insights", false);
setS("ai.report_daily_cost_toman", 5000);
psql("delete from ai_requests where purpose='report_insight'");
ok(
  psql("select string_agg(key || '=' || value::text, ',' order by key) from settings where key in ('ai.report_insights','ai.report_daily_cost_toman')") ===
    "ai.report_daily_cost_toman=5000,ai.report_insights=false",
  "seed: switch off, cap 5,000",
);
// داده: ۴۰ بازدید مهمان در ۴ روز برای یک محصول
const P = psql("select id || '|' || title_fa from products where status='published' order by slug limit 1").split("|");
psql("delete from events where anon_id like 'insight-%'");
psql(
  `insert into events (anon_id, type, entity_type, entity_id, occurred_at) select 'insight-' || g, 'product_view', 'product', '${P[0]}', now() - make_interval(days => g % 4) from generate_series(1, 40) g`,
);

const mock = spawn(process.execPath, [new URL("./mock-ai.mjs", import.meta.url).pathname, "3399"], { stdio: ["ignore", "ignore", "inherit"] });
process.on("exit", () => mock.kill());
await sleep(500);
const mockN = async () => (await (await fetch(MOCK + "/__log")).json()).length;
const rows = () => psql("select count(*) from ai_requests where purpose='report_insight'");

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
const card = () => ad.getByTestId("insight");

// ---------- خاموش ----------
await ad.goto(B + "/admin/reports?range=7d");
ok((await card().innerText()).includes("خاموش است") && (await card().getByRole("button", { name: "تحلیل کن" }).isDisabled()), "switch off → disabled button (section 51)");
setS("ai.report_insights", true);

// ---------- داده‌ی کم ← بدون مدل ----------
await ad.goto(B + "/admin/reports?range=custom&from=2026-01-01&to=2026-01-03");
ok(await vis(ad.getByTestId("insight-not-enough")), "too little data → «داده‌ی کافی برای تحلیل نیست»");
ok((await card().getByRole("button", { name: "تحلیل کن" }).isDisabled()) && rows() === "0", "disabled button, no model request");

// ---------- اجرا و ذخیره برای امروز ----------
await ad.goto(B + "/admin/reports?range=7d");
ok((await card().innerText()).includes("حدود ۸۰۰ تا ۱٬۵۰۰ تومان"), "cost estimate shown before running");
const n0 = await mockN();
await card().getByRole("button", { name: "تحلیل کن" }).click();
ok(await vis(ad.getByTestId("insight-result"), 20000), "insight shown after «تحلیل کن»");
const items = await ad.getByTestId("insight-result").locator("li").allInnerTexts();
ok(items.length === 4 && items.some((x) => x.includes("گفتگوهای بی‌پاسخ")), `3 to 5 suggestions (${items.length})`);
ok((await mockN()) === n0 + 1 && rows() === "1", "one model request");
ok(
  psql(
    "select status || '|' || cost_toman::float || '|' || (meta->>'day' = to_char(now() at time zone 'Asia/Tehran', 'YYYY-MM-DD'))::text from ai_requests where purpose='report_insight'",
  ) === "ok|400|true",
  "stored for today with cost",
);
const sent = JSON.stringify((await (await fetch(MOCK + "/__log")).json()).at(-1));
ok(/\b[0-9][0-9,]* views\b/.test(sent) && !/product_views[^}]*:\s*[0-9]/.test(sent) && sent.includes(P[1]), "numbers sent with units; product names included");
ok(!/supplier|factory|name_en|company/i.test(psql("select meta->>'input' from ai_requests where purpose='report_insight'")), "no supplier data in the input");
ok((await ad.getByTestId("insight-meta").innerText()).includes("هزینه ۴۰۰ تومان"), "date, range and cost shown");
// باز کردن دوباره ← بدون درخواست تازه
await ad.reload();
await ad.goto(B + "/admin/ai");
await ad.goto(B + "/admin/reports?range=7d");
ok((await mockN()) === n0 + 1 && (await ad.getByTestId("insight-result").locator("li").count()) === 4, "reopening the page: same result, no new request");
// بازه‌ی دیگر ← نتیجه‌ی جدا
await ad.goto(B + "/admin/reports?range=30d");
ok((await ad.getByTestId("insight-result").count()) === 0, "other range → its own result (none yet)");

// ---------- عدد ساختگی و اسم سایت ← آن پیشنهادها حذف ----------
psql(`update products set title_fa = title_fa || ' [[insfake]]' where id='${P[0]}'`);
await ad.goto(B + "/admin/reports?range=7d");
await card().getByRole("button", { name: "تحلیل دوباره" }).click();
ok(await waitFor(() => rows() === "2", 20000), "re-run");
await ad.reload();
const t2 = await ad.getByTestId("insight-result").innerText();
ok(
  !t2.includes("Alibaba") && !t2.includes("۵۰ میلیون") && (await ad.getByTestId("insight-result").locator("li").count()) === 2,
  `invented money and shopping site dropped (${t2.slice(0, 200)})`,
);
ok((await ad.getByTestId("insight-meta").innerText()).includes("۲ پیشنهاد"), "note: 2 suggestions dropped");
ok(
  psql(
    "select string_agg(split_part(d->>'reason', ':', 1), ',' order by d->>'reason') from ai_requests, jsonb_array_elements(meta->'dropped') d where purpose='report_insight' and id=(select max(id) from ai_requests where purpose='report_insight')",
  ) === "guard,numbers",
  "reasons logged: guard + numbers",
);
// همه ردشدنی ← «قابل اعتماد نبود»، نتیجه‌ی قبلی می‌ماند
psql(`update products set title_fa = replace(title_fa, '[[insfake]]', '[[insnone]]') where id='${P[0]}'`);
await ad.goto(B + "/admin/reports?range=7d");
await card().getByRole("button", { name: "تحلیل دوباره" }).click();
ok(await vis(ad.getByText(/تحلیل قابل اعتماد نبود/), 20000), "all suggestions rejected → «تحلیل قابل اعتماد نبود»");
ok(psql("select status from ai_requests where purpose='report_insight' order by id desc limit 1") === "guard_block", "logged as guard_block");
psql(`update products set title_fa = replace(title_fa, ' [[insnone]]', '') where id='${P[0]}'`);

// ---------- سقف روزانه ----------
setS("ai.report_daily_cost_toman", 1000);
await ad.goto(B + "/admin/reports?range=7d");
ok(await vis(ad.getByTestId("insight-cap")), "cap reached (3 × 400 ≥ 1,000) → no button");
ok(await card().getByRole("button", { name: /تحلیل/ }).isDisabled(), "run button disabled over the cap");

// ---------- تنظیم از پنل ----------
await ad.goto(B + "/admin/ai");
const box = ad.getByTestId("report-insight-settings");
await box.locator('input[name="reportCap"]').fill("5000");
await box.locator('input[name="reportInsights"]').uncheck();
await box.getByRole("button", { name: "ذخیره" }).click();
ok(
  await waitFor(() => psql("select string_agg(value::text, ',' order by key) from settings where key in ('ai.report_daily_cost_toman','ai.report_insights')") === "5000,false"),
  "panel: switch and cap saved",
);
setS("ai.report_insights", true);

// ---------- دسترسی ----------
setS("auth.enforce_permissions", true);
psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
psql("insert into role_permissions (role_id, permission_key) select id, 'dashboard.view' from roles where key='expert'");
const ex = await page();
await expert(ex);
const r403 = await ex.goto(B + "/admin/reports?range=7d");
ok(r403.status() === 403 || (await ex.getByTestId("insight").count()) === 0, "no reports.view → no insight");
psql("insert into role_permissions (role_id, permission_key) select id, 'reports.view' from roles where key='expert'");
await ex.goto(B + "/admin/reports?range=7d");
ok((await ex.getByTestId("insight").count()) === 0, "reports.view without reports.insight → no insight card (section 50)");
psql("insert into role_permissions (role_id, permission_key) select id, 'reports.insight' from roles where key='expert'");
await ex.goto(B + "/admin/reports?range=7d");
ok(await vis(ex.getByTestId("insight-result")), "reports.view + reports.insight → sees the saved insight");
psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
psql("insert into role_permissions (role_id, permission_key) select id, 'dashboard.view' from roles where key='expert'");
setS("auth.enforce_permissions", false);

setS("ai.report_insights", false);
psql("delete from events where anon_id like 'insight-%'");
await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
