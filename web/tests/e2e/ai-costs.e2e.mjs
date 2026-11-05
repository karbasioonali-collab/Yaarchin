// صفحه‌ی «هزینه‌ی هوش مصنوعی» (بخش ۵۲؛ بدون migration و seed). سرور با DASHBOARD_CACHE_MS=0 (run-all: MOCK_ENV).
// اجرا: TEST_DB=postgres://…/yarchin_e2e node tests/e2e/ai-costs.e2e.mjs
import { B, admin, done, expert, launch, ok, psql, setS, sleep } from "./lib.mjs";

const fa = (n) => `${Number(n).toLocaleString("fa-IR")} تومان`;
const tehranYmd = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const addDays = (ymd, k) => {
  const t = new Date(ymd + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + k);
  return t.toISOString().slice(0, 10);
};
const TODAY = tehranYmd();
// روز ماه شمسی امروز (تقویم ایرانی Intl)
const jd = Number(new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { timeZone: "Asia/Tehran", day: "numeric" }).format(new Date()));
const MONTH1 = addDays(TODAY, -(jd - 1)); // اول ماه شمسی جاری
const PREV = addDays(MONTH1, -1); // آخر ماه قبل
const OLD = addDays(TODAY, -400); // بیش از ۱۲ ماه پیش
const at = (ymd) => `'${ymd}T12:00:00+03:30'`;

// درخواست‌های زنده‌ی تست‌های قبلی موقتاً «آزمایشی» می‌شوند تا جمع‌ها فقط داده‌ی همین تست باشد؛ در پایان برمی‌گردند
const moved = psql("select coalesce(string_agg(id::text, ','), '') from ai_requests where mode='live'");
if (moved) psql(`update ai_requests set mode='test' where id in (${moved})`);
const ins = (purpose, cost, ymd, mode = "live") =>
  psql(
    `insert into ai_requests (purpose, mode, model, status, cost_toman, meta, created_at) values ('${purpose}', '${mode}', 'mock/primary', 'ok', ${cost}, '{"e2e":"ai-costs"}', ${at(ymd)})`,
  );
ins("chat", 1000, TODAY);
ins("report_insight", 400, TODAY);
ins("test_run", 200, MONTH1);
ins("catalog_text", 300, PREV);
ins("connection_test", 7, OLD);
ins("extract", 3, OLD);
ins("chat", 999, TODAY, "test"); // حالت آزمایشی ← حساب نمی‌شود

setS("auth.enforce_permissions", false);
const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);

// ---------- منو ----------
const links = (await ad.locator("aside nav a").allInnerTexts()).map((x) => x.trim());
const i = links.indexOf("دستیار هوشمند");
ok(i >= 0 && links[i + 1] === "هزینه‌ی هوش مصنوعی", `menu: right after «دستیار هوشمند» (${links.slice(i, i + 2).join(" / ")})`);

// ---------- ماهانه (پیش‌فرض) ----------
await ad.goto(B + "/admin/ai/costs");
ok((await ad.getByTestId("cost-all-total").innerText()).includes(fa(1910)), "all-time total (live only)");
const activeNav = await ad.locator('aside nav a[class*="navLinkActive"]').allInnerTexts();
ok(activeNav.join() === "هزینه‌ی هوش مصنوعی", `only the longest matching menu item is active (${activeNav.join(" / ")})`);
ok(
  (await ad.getByTestId("cost-window-total").innerText()).includes(fa(1900)) && (await ad.getByTestId("cost-window-total").innerText()).includes("۱۲ ماه اخیر"),
  "default monthly: 12-month total excludes > 12 months",
);
const bars = ad.getByTestId("cost-bar");
ok((await bars.count()) === 12, "12 monthly bars");
const last = bars.last();
ok((await last.getAttribute("data-start")) === MONTH1 && (await last.getAttribute("data-total")) === "1600", `this Jalali month from ${MONTH1} = 1,600`);
ok((await bars.nth(10).getAttribute("data-total")) === "300", "previous month = 300");
const groups = await last.locator("rect[data-group]").evaluateAll((rs) => rs.map((r) => `${r.getAttribute("data-group")}:${r.getAttribute("fill")}`));
ok(groups.join(",") === "chat:#2F7D5C,tests:#FF7A00,report:#7A4FB5", `stacked colors by purpose (${groups.join(",")})`);
ok((await ad.getByTestId("cost-legend").locator("li").count()) === 6, "legend: 6 groups");
const det = await ad.getByTestId("cost-detail").innerText();
ok(
  det.includes(fa(1600)) && det.includes(`چت: ${fa(1000)}`) && det.includes(`آزمون دستیار: ${fa(200)}`) && det.includes(`تحلیل گزارش: ${fa(400)}`),
  "detail of the selected (current) month",
);
await bars.nth(10).click();
await ad.waitForURL(/s=/);
ok((await ad.getByTestId("cost-detail").innerText()).includes(`متن محصول: ${fa(300)}`), "tap a bar → its detail");
const parts = await ad.getByTestId("cost-all-parts").innerText();
ok(parts.includes(`تست اتصال: ${fa(7)}`) && parts.includes(`سایر: ${fa(3)}`), "all-time by purpose (unknown purpose → other)");

// ---------- روزانه، هفتگی، سالانه ----------
await ad.getByTestId("cost-periods").getByRole("link", { name: "روزانه" }).click();
await ad.waitForURL(/p=day/);
const todayCost = 1400 + (MONTH1 === TODAY ? 200 : 0);
ok(
  (await bars.count()) === 30 && (await bars.last().getAttribute("data-total")) === String(todayCost) && (await bars.last().getAttribute("data-start")) === TODAY,
  `daily: 30 bars, today = ${todayCost}`,
);
const from30 = addDays(TODAY, -29);
const want30 = 1400 + (MONTH1 >= from30 ? 200 : 0) + (PREV >= from30 ? 300 : 0);
ok((await ad.getByTestId("cost-window-total").innerText()).includes(fa(want30)), `daily window total = ${want30}`);
await ad.goto(B + "/admin/ai/costs?p=week");
ok((await bars.count()) === 12, "weekly: 12 bars");
await ad.goto(B + "/admin/ai/costs?p=year");
ok((await bars.count()) >= 2 && (await ad.getByTestId("cost-window-total").innerText()).includes(fa(1910)), "yearly: every year, window = all-time");

// ---------- کارت خلاصه و لینک داشبورد ----------
await ad.goto(B + "/admin/ai");
const sum = await ad.getByTestId("ai-cost-summary").innerText();
ok(
  sum.includes(fa(1910)) && sum.includes(fa(1600)) && (await ad.getByTestId("ai-cost-summary").getByRole("link").getAttribute("href")) === "/admin/ai/costs",
  "AI page: summary card with link",
);
await ad.goto(B + "/admin");
ok((await ad.getByTestId("dash-ai-cost").getByRole("link", { name: "نمودار" }).getAttribute("href")) === "/admin/ai/costs", "dashboard cost card links to the chart");

// ---------- دسترسی ----------
const role = (keys) => {
  psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
  psql(
    `insert into role_permissions (role_id, permission_key) select r.id, k from roles r, unnest(array[${["dashboard.view", ...keys].map((k) => `'${k}'`).join(",")}]) k where r.key='expert'`,
  );
};
role([]);
const ex = await page();
await expert(ex);
await ex.goto(B + "/admin/ai/costs");
ok(ex.url().endsWith("/admin/ai/costs") && (await ex.getByTestId("cost-chart").count()) === 1, "enforce off: expert sees the page as before");
setS("auth.enforce_permissions", true);
await ex.goto(B + "/admin/ai/costs");
ok(!ex.url().endsWith("/admin/ai/costs"), `enforce on, no ai.costs → blocked (${ex.url()})`);
ok((await ex.locator("aside nav a", { hasText: "هزینه‌ی هوش مصنوعی" }).count()) === 0, "no menu item without ai.costs");
role(["ai.costs"]);
await ex.goto(B + "/admin/ai/costs");
ok(ex.url().endsWith("/admin/ai/costs") && (await ex.locator("aside nav a", { hasText: "هزینه‌ی هوش مصنوعی" }).count()) === 1, "ai.costs alone → page and menu item");
await ex.goto(B + "/admin/ai");
ok(!ex.url().endsWith("/admin/ai"), "ai.costs alone does not open the AI settings page");
role(["ai.settings"]);
await ex.goto(B + "/admin/ai");
ok(ex.url().endsWith("/admin/ai") && (await ex.getByTestId("ai-cost-summary").count()) === 0, "ai.settings without ai.costs → no cost summary");
role(["ai.settings", "ai.costs"]);
await ex.reload();
ok((await ex.getByTestId("ai-cost-summary").count()) === 1, "both → summary card");

// ---------- موبایل ۳۶۰ ----------
await ad.setViewportSize({ width: 360, height: 760 });
await ad.goto(B + "/admin/ai/costs?p=day");
const sw = await ad.evaluate(() => document.documentElement.scrollWidth);
const cw = await ad.getByTestId("cost-chart").evaluate((e) => e.getBoundingClientRect().width);
ok(sw <= 362 && cw <= 340, `mobile: no horizontal scroll, chart fits (${sw} / ${Math.round(cw)})`);

// ---------- پاک‌سازی ----------
role([]);
setS("auth.enforce_permissions", false);
psql(`delete from ai_requests where meta->>'e2e' = 'ai-costs'`);
if (moved) psql(`update ai_requests set mode='live' where id in (${moved})`);
await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
