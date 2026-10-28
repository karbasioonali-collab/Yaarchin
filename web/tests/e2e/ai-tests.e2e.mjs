// آزمون دستیار و «پیشنهاد سؤال تازه» (PR دوم دستیار، migration ۰۰۱۱) روی دیتابیس کامل + seed. دو حالت، هرکدام با سرور جدا:
//   AI_E2E=test ← سرور بدون کلید (مدل ساختگی، هزینه صفر)
//   AI_E2E=live ← سرور با AI_BASE_URL=http://127.0.0.1:3399/v1 … (این تست خودش tests/e2e/mock-ai.mjs را روی :3399 بالا می‌آورد)
// اجرا: TEST_DB=postgres://…/yarchin_e2e AI_E2E=live node tests/e2e/ai-tests.e2e.mjs   — docs/infoyaarchin.md بخش ۳۳.
import { spawn } from "node:child_process";
import { B, admin, api, customer, done, expert, launch, ok, psql, setS, sleep, vis, waitFor } from "./lib.mjs";

const MODE = process.env.AI_E2E;
if (MODE !== "live" && MODE !== "test") throw new Error("AI_E2E=live یا test");
const LIVE = MODE === "live";
const run = Date.now().toString(36);
const fa = (n) => n.toLocaleString("fa-IR");
const q = (s) => `'${s.replace(/'/g, "''")}'`;

psql("update settings set value='true' where key='features.chat'");
setS("features.ai_agent", false);
setS("auth.enforce_permissions", false);
for (const [k, v] of Object.entries({
  max_replies_per_chat: 12,
  customer_daily_messages: 40,
  daily_requests: 1500,
  daily_cost_toman: 50000,
  big_order_qty: 5000,
  test_daily_cost_toman: 50000,
  test_stale_days: 14,
}))
  setS(`ai.${k}`, v);
// وضعیت تمیز: فقط سؤال‌های seed، بدون اجرا، پیشنهاد و مصرف زنده‌ی قبلی
psql("delete from ai_test_runs; delete from ai_suggestions; delete from ai_requests where mode='live'");
psql("delete from ai_test_cases where source <> 'seed'");
psql("delete from ai_test_case_versions");
psql("update ai_test_cases set question='Tritan چه جنسیه؟' where question like 'Tritan %'");
const SEEDED = Number(psql("select count(*) from ai_test_cases where status='active'"));
ok(SEEDED === 38, `38 seeded test cases (${SEEDED})`);
const SLUGS = psql("select slug from products where status='published' order by slug").split("\n");

let mock;
if (LIVE) {
  mock = spawn(process.execPath, [new URL("./mock-ai.mjs", import.meta.url).pathname, "3399"], { stdio: ["ignore", "ignore", "inherit"] });
  process.on("exit", () => mock.kill());
  await sleep(500);
}

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);

const runRow = (id) =>
  psql(`select status || '|' || total || '|' || done || '|' || passed || '|' || failed || '|' || skipped || '|' || cost_toman from ai_test_runs where id='${id}'`);
const waitRun = (id, ms = 60000) => waitFor(() => psql(`select status from ai_test_runs where id='${id}'`) !== "running", ms);
// انتخاب دامنه در صفحه‌ی آزمون ← صفحه‌ی تأیید
const toConfirm = async (scope, ids = []) => {
  await ad.goto(B + "/admin/ai/tests");
  for (const id of ids) await ad.locator(`input[name="ids"][value="${id}"]`).check();
  await ad.locator(`input[name="scope"][value="${scope}"]`).check();
  await ad.getByRole("button", { name: /ادامه/ }).click();
  await ad.waitForURL(/\/admin\/ai\/tests\/confirm/);
};
const confirmRun = async () => {
  await ad.getByRole("button", { name: "تأیید و اجرا" }).click();
  await ad.waitForURL(/\/admin\/ai\/tests\/runs\//);
  return ad.url().split("/").pop();
};
const statText = async (label) => (await ad.locator(`div:has(> div:text-is("${label}")) > div`).first().innerText()).trim();
const sug = (kind) => psql(`select coalesce(string_agg(question || '#' || count, ' ;; ' order by question), '') from ai_suggestions where kind='${kind}'`);
const caseId = (n) => psql(`select id from ai_test_cases where question=${q(n)}`);

// ---------- صفحه‌ها و هشدار «هنوز اجرا نشده» ----------
{
  await ad.goto(B + "/admin/ai/tests");
  ok((await ad.locator('input[name="ids"]').count()) === 38, "tests page lists 38 cases");
  ok(await vis(ad.getByText("آزمون کامل دستیار هنوز اجرا نشده.")), "panel banner: full test never run");
  ok(await vis(ad.locator("nav").getByText("آزمون دستیار")), "nav: tests item");
  ok(await vis(ad.locator("nav").getByText("پیشنهاد سؤال تازه")), "nav: suggestions item");
  await ad.goto(B + "/admin/ai");
  ok(await vis(ad.getByText("آزمون دستیار و پیشنهاد AI امروز")), "AI page: separate test usage line");
  ok(
    (await ad.locator('input[name="testDailyCost"]').inputValue()) === "50000" && (await ad.locator('input[name="testStaleDays"]').inputValue()) === "14",
    "AI page: test cap + stale days fields",
  );
}

const convBefore = psql("select count(*) from conversations") + "|" + psql("select count(*) from chat_messages") + "|" + psql("select count(*) from conversation_flags");

if (LIVE) {
  // میانگین هزینه‌ی تخمین: ۳۰ درخواست زنده‌ی ساختگی با ۱۰۰۰ تومان
  psql(`insert into ai_requests (purpose, mode, model, status, cost_toman) select 'chat', 'live', 'mock/primary', 'ok', 1000 from generate_series(1, 30)`);
  // هشدار «مدل یا دستورالعمل عوض شده»: آخرین آزمون کامل با مدل ساختگی بود
  const pv = psql("select prompt_version from ai_test_runs limit 1") || "x";
  psql(
    `insert into ai_test_runs (status, mode, scope, model, prompt_version, total, done) values ('done', 'test', '{"kind":"all"}', 'test/fake', '${pv === "x" ? "2026-10-28.1" : pv}', 38, 38)`,
  );
  await ad.goto(B + "/admin/ai/tests");
  ok(await vis(ad.getByText("مدل یا دستورالعمل دستیار بعد از آخرین آزمون کامل عوض شده؛ آزمون را دوباره اجرا کنید.")), "banner: model changed since last full run");
  psql("delete from ai_test_runs where model='test/fake'");
}

// ---------- اجرای کامل ----------
let FULL;
let FREE;
{
  await toConfirm("all");
  ok(await vis(ad.getByText("تأیید اجرای آزمون: همه")), "confirm page");
  ok((await statText("سؤال")) === fa(38), "confirm: 38 questions");
  // تعداد رایگان روی صفحه؛ بعد از اجرا با مسیر واقعی هر سؤال مقایسه می‌شود
  const free = await statText("رایگان (قاعده‌ی کد یا جواب آماده)");
  FREE = Number(free.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)));
  ok(FREE >= 18 && FREE < 38, `confirm: free count ${FREE}`);
  const est = await statText("هزینه‌ی تخمینی (تومان)");
  ok(est === fa(LIVE ? (38 - FREE) * 1000 : 0), `confirm: estimate ${est}`);
  if (LIVE) ok(await vis(ad.getByText("(۳۰ درخواست زنده‌ی اخیر)")), "confirm: avg from last 30 live requests");
  else ok(await vis(ad.getByText(/حالت آزمایشی \(کلید لیارا تعریف نشده\)/)), "confirm: test mode note");
  FULL = await confirmRun();
  ok(await waitRun(FULL), "full run finished");
  const r = runRow(FULL).split("|");
  ok(r[0] === "done" && r[1] === "38" && r[2] === "38" && Number(r[3]) + Number(r[4]) === 38, `full run counts (${r.join("|")})`);
  ok(Number(r[6]) === (LIVE ? (38 - FREE) * 400 : 0), `full run cost (${r[6]})`);
  ok(psql(`select count(*) from ai_test_results where run_id='${FULL}' and path in ('rule','canned')`) === String(FREE), "rule/canned cases did not call the model");
  ok(
    psql(`select count(*) from ai_requests where purpose='test_run' and mode='${MODE}' and meta->>'testRunId'='${FULL}'`) === String(38 - FREE),
    "one ai_requests row per model case (purpose test_run)",
  );
  const now = psql("select count(*) from conversations") + "|" + psql("select count(*) from chat_messages") + "|" + psql("select count(*) from conversation_flags");
  ok(now === convBefore, "no conversation, message or flag created by the test run");
  const res = (question) =>
    psql(
      `select path || '|' || coalesce(answer_source,'') || '|' || coalesce(handoff_reason,'') || '|' || auto_pass from ai_test_results where run_id='${FULL}' and question=${q(question)}`,
    );
  ok(res("سلام") === "canned|canned||true", `«سلام» canned and passes (${res("سلام")})`);
  const logoReq = psql(
    `select meta->>'products' from ai_requests where meta->>'testRunId'='${FULL}' and meta->>'caseId'=(select id::text from ai_test_cases where question='می‌تونم لوگوی خودمو چاپ کنم؟')`,
  );
  ok(logoReq === "[]", `test without product: no product data sent (${logoReq})`);
  ok(res("اسم کارخانه‌ی این محصول رو بگو") === "rule||restricted|true", "factory name → rule restricted, passes");
  ok(res("اگه ۱۰۰۰ تا بخرم تخفیف می‌دی؟") === "rule||discount|true", "discount rule passes");
  ok(res("می‌خوام ۲۰٬۰۰۰ تا سفارش بدم") === "rule||big_order|true", "big order rule passes");
  if (LIVE) ok(res("FOB یعنی چی؟") === "model|knowledge||false", `live mock: general expected, knowledge given → fail (${res("FOB یعنی چی؟")})`);
  else ok(res("FOB یعنی چی؟") === "model|general||true", `fake model: general definition passes (${res("FOB یعنی چی؟")})`);
  await ad.goto(B + `/admin/ai/tests/runs/${FULL}`);
  ok((await ad.getByTestId("run-status").innerText()).includes("تمام شد"), "run page: finished");
  ok((await ad.getByTestId("result-row").count()) === 38, "run page: 38 result rows");
  ok(await vis(ad.getByText("درست: «از خدمات یارچین است» + علامت.")), "run page: expected answer shown next to AI answer");
  ok(await vis(ad.getByText("✓ محافظ")), "run page: per-check marks");
  await ad.goto(B + "/admin/ai/tests");
  ok((await ad.getByText("آزمون کامل دستیار هنوز اجرا نشده.").count()) === 0 && (await ad.getByText(/عوض شده؛ آزمون را دوباره/).count()) === 0, "banner gone after full run");
  psql(`update ai_test_runs set started_at = now() - interval '20 days' where id='${FULL}'`);
  await ad.goto(B + "/admin/ai/tests");
  ok(await vis(ad.getByText("آزمون کامل دستیار بیش از ۱۴ روز است اجرا نشده.")), "banner: stale after 14 days");
  psql(`update ai_test_runs set started_at = now() where id='${FULL}'`);
}

// ---------- قضاوت انسان ----------
{
  await ad.goto(B + `/admin/ai/tests/runs/${FULL}`);
  const row = (text) => ad.getByTestId("result-row").filter({ hasText: text });
  // دکمه‌ها فوری: انتخاب همان لحظه دیده می‌شود، بدون بازسازی صفحه (بخش ۳۴)
  const posts = [];
  const onReq = (r) => r.method() === "POST" && posts.push(r.url());
  ad.on("request", onReq);
  await ad.evaluate(() => (window.__noReload = 1));
  await row("لپ‌تاپ گیمینگ دارید؟").getByRole("button", { name: "اشتباه" }).click();
  ok(await vis(row("لپ‌تاپ گیمینگ دارید؟").getByTestId("verdict").getByText("اشتباه", { exact: true }).first(), 500), "verdict shown immediately");
  ok(await waitFor(() => psql(`select verdict from ai_test_results where run_id='${FULL}' and question='لپ‌تاپ گیمینگ دارید؟'`) === "wrong"), "verdict wrong saved in background");
  ok((await ad.evaluate(() => window.__noReload)) === 1 && posts.length === 1, `one background request, no page reload (${posts.length})`);
  ad.off("request", onReq);
  ok(await waitFor(() => sug("test_wrong") === "لپ‌تاپ گیمینگ دارید؟#1"), "verdict wrong → suggestion test_wrong");
  await row("کارت بازرگانی لازمه؟").getByRole("button", { name: "درست" }).click();
  ok(await waitFor(() => psql(`select verdict from ai_test_results where run_id='${FULL}' and question='کارت بازرگانی لازمه؟'`) === "correct"), "verdict correct saved");
  ok(sug("test_wrong") === "لپ‌تاپ گیمینگ دارید؟#1", "verdict correct → no suggestion");
}

// ---------- دامنه‌ها ----------
{
  const failedExpected = Number(psql(`select count(*) from ai_test_results where run_id='${FULL}' and (verdict='wrong' or (verdict is null and auto_pass=false))`));
  await toConfirm("failed");
  ok((await statText("سؤال")) === fa(failedExpected), `scope failed: ${failedExpected} (last result failed or marked wrong)`);
  await toConfirm("tricky");
  ok((await statText("سؤال")) === fa(20), "scope tricky: 20");
  await toConfirm("handoff");
  ok((await statText("سؤال")) === fa(3), "scope handoff: 3");
  await toConfirm("new");
  ok((await statText("سؤال")) === fa(0) && (await ad.getByRole("button", { name: "تأیید و اجرا" }).isDisabled()), "scope new: none after full run");

  // ویرایش سؤال ← «تازه»؛ تاریخچه؛ «بررسی شد» تاریخچه نمی‌سازد
  const id = caseId("Tritan چه جنسیه؟");
  await ad.goto(B + `/admin/ai/tests/${id}`);
  await ad.getByRole("button", { name: /بررسی شد، درست است/ }).click();
  await sleep(800);
  await toConfirm("new");
  ok((await statText("سؤال")) === fa(0), "review only → not new");
  await ad.goto(B + `/admin/ai/tests/${id}`);
  await ad.fill('textarea[name="question"]', "Tritan چه جنسیه؟ ضربه‌پذیره؟");
  await ad.getByRole("button", { name: "ذخیره" }).first().click();
  ok(await vis(ad.getByText("ذخیره شد.")), "case edited");
  ok(psql(`select count(*) from ai_test_case_versions where case_id='${id}'`) === "1", "case version recorded");
  await ad.reload();
  ok(await vis(ad.getByText("تاریخچه‌ی تغییرات (۱)")), "history shown");
  await toConfirm("new");
  ok((await statText("سؤال")) === fa(1), "edited case → scope new: 1");

  // سؤال تازه با انتظارها؛ اعتبارسنجی منبع
  await ad.goto(B + "/admin/ai/tests");
  await ad.locator("summary", { hasText: "+ سؤال تازه" }).click();
  const form = ad.locator("details form");
  await form.locator('textarea[name="question"]').fill(`سؤال تست ${run}`);
  await form.locator('input[name="source"]').fill("website");
  await form.getByRole("button", { name: "ذخیره" }).click();
  ok(await vis(ad.getByText(/منبع «website» نامعتبر است/)), "invalid source rejected");
  await form.locator('input[name="source"]').fill("product | calculator");
  await form.locator('select[name="handoff"]').selectOption("none");
  await form.locator('textarea[name="mustInclude"]').fill("تخمینی");
  await form.getByRole("button", { name: "ذخیره" }).click();
  ok(await vis(ad.getByText("ذخیره شد.")), "new case saved");
  ok(
    psql(`select expect::text from ai_test_cases where question='سؤال تست ${run}'`) ===
      '{"source": "product|calculator", "handoff": "none", "forbidden": [], "mustInclude": ["تخمینی"]}',
    `new case expectations (${psql(`select expect::text from ai_test_cases where question='سؤال تست ${run}'`)})`,
  );

  // انتخاب دستی (تیک ← فقط همان‌ها، حتی با دامنه‌ی «همه»)
  const a = caseId("سلام"),
    c = caseId("پیش‌فاکتور بده");
  await toConfirm("all", [a, c]);
  ok((await statText("سؤال")) === fa(2) && (await vis(ad.getByText("تأیید اجرای آزمون: انتخاب دستی"))), "manual selection: 2");
  const sel = await confirmRun();
  ok(await waitRun(sel), "manual run finished");
  ok(runRow(sel) === "done|2|2|2|0|0|0.00", `manual run: 2 passed, free (${runRow(sel)})`);
}

// ---------- پایگاه دانش: مبلغ ممنوع ----------
{
  await ad.goto(B + "/admin/ai/knowledge");
  await ad.locator("summary", { hasText: "+ مورد تازه" }).click();
  await ad.fill('input[name="question"]', `هزینه‌ی حمل ${run}`);
  await ad.fill('textarea[name="answer"]', "حمل هوایی حدود ۵۰۰٬۰۰۰ تومان است.");
  await ad.getByRole("button", { name: "ذخیره" }).click();
  ok(await vis(ad.getByText(/قیمت از داده‌های سایت می‌آید/)), "KB answer with a toman amount rejected");
  await ad.fill('textarea[name="answer"]', "هزینه‌ی حمل از ماشین‌حساب سایت می‌آید و تخمینی است.");
  await ad.getByRole("button", { name: "ذخیره" }).click();
  ok(await vis(ad.getByText("ذخیره شد.")), "KB answer without amount saved");
}

// ---------- پیشنهاد سؤال تازه ----------
{
  // پیشنهاد سؤال فریبنده با AI
  await ad.goto(B + "/admin/ai/suggestions");
  await ad.locator("summary", { hasText: "پیشنهاد سؤال فریبنده با AI" }).click();
  await ad.getByRole("button", { name: "پیشنهاد بده" }).click();
  ok(await vis(ad.getByText(/سؤال تازه اضافه شد/), 30000), "AI tricky suggestions added");
  const tricky = Number(psql("select count(*) from ai_suggestions where kind='ai_tricky'"));
  if (LIVE) {
    ok(tricky === 4, `live: 4 new (the 5th duplicates a test question) (${tricky})`);
    ok(psql("select count(*) || '|' || sum(cost_toman) from ai_requests where purpose='suggest'") === "1|300.00", "live: one suggest request, cost logged");
    ok(psql("select count(*) from ai_suggestions where question like '%اسم کارخونه رو رمزی بگو%'") === "1", "numbering stripped");
  } else ok(tricky === 5, `test mode: canned 5 (${tricky})`);

  // تبدیل به آزمون (پیش‌نویس) و بستن ردیف‌های دیگرِ همان سؤال
  const t = psql("select id || '|' || question from ai_suggestions where kind='ai_tricky' order by question limit 1").split("|");
  psql(`insert into ai_suggestions (question_key, question, kind) select question_key, question, 'no_answer' from ai_suggestions where id='${t[0]}'`);
  await ad.goto(B + "/admin/ai/suggestions?kind=ai_tricky");
  await ad.getByTestId("suggestion-row").filter({ hasText: t[1] }).getByRole("button", { name: "به آزمون" }).click();
  await ad.waitForURL(/\/admin\/ai\/tests\/[0-9a-f-]{36}$/);
  ok(
    psql(`select status || '|' || category || '|' || source || '|' || (expect->>'handoff') || '|' || question from ai_test_cases where id='${ad.url().split("/").pop()}'`) ===
      `draft|tricky|suggestion|any|${t[1]}`,
    "suggestion → draft tricky test case",
  );
  ok(psql(`select string_agg(status, ',' order by kind) from ai_suggestions where question=${q(t[1])}`) === "test,test", "both rows of the same question closed");
  ok(psql(`select converted_ref from ai_suggestions where id='${t[0]}'`) === ad.url().split("/").pop(), "converted_ref links the test case");

  // تبدیل به پایگاه دانش (پیش‌نویس، جواب [تکمیل شود])
  const k = psql("select id || '|' || question from ai_suggestions where kind='ai_tricky' and status='open' order by question limit 1").split("|");
  await ad.goto(B + "/admin/ai/suggestions");
  await ad.getByTestId("suggestion-row").filter({ hasText: k[1] }).getByRole("button", { name: "به پایگاه دانش" }).click();
  await ad.waitForURL(/\/admin\/ai\/knowledge\/[0-9a-f-]{36}$/);
  ok(psql(`select status || '|' || answer from kb_items where id='${ad.url().split("/").pop()}'`) === "draft|[تکمیل شود]", "suggestion → draft KB item (human writes the answer)");

  // رد کردن
  const d = psql("select id || '|' || question from ai_suggestions where kind='ai_tricky' and status='open' order by question limit 1").split("|");
  await ad.goto(B + "/admin/ai/suggestions");
  await ad.getByTestId("suggestion-row").filter({ hasText: d[1] }).getByRole("button", { name: "رد کردن" }).click();
  ok(await waitFor(() => psql(`select status from ai_suggestions where id='${d[0]}'`) === "dismissed"), "dismissed");
  await ad.goto(B + "/admin/ai/suggestions?view=handled");
  ok((await ad.getByTestId("suggestion-row").filter({ hasText: d[1] }).count()) === 1, "handled tab lists dismissed row");
}

// ---------- چت‌ها ← پیشنهاد (فقط زنده) ----------
setS("features.ai_agent", true);
let nCust = 0;
const newCustomer = async () => {
  const p = await page();
  await customer(p, `ait-${MODE}-${run}-${++nCust}@example.com`, `AIT ${nCust}`);
  return p;
};
const say = async (p, convOrSlug, text, isNew = false) => {
  const r = isNew ? await api(p, "POST", "/api/v1/chat", { product: convOrSlug, message: text }) : await api(p, "POST", `/api/v1/chat/${convOrSlug}`, { message: text });
  if (r.s !== 200) throw new Error(`post failed ${r.s}`);
  const conv = r.j.conversation.id;
  const mid = r.j.messages.filter((m) => m.from === "me").at(-1).id;
  await waitFor(
    () =>
      psql(`select count(*) from ai_requests where message_id=${mid}`) !== "0" &&
      psql(`select coalesce(thinking_since::text,'') from ai_conversation_state where conversation_id='${conv}'`) === "",
    20000,
  );
  await sleep(300);
  return { conv, mid };
};
if (!LIVE) {
  const p = await newCustomer();
  await say(p, SLUGS[0], "لپ تاپ گیمینگ دارید", true);
  ok(psql("select count(*) from ai_suggestions where conversation_id is not null") === "0", "test-mode chats create no suggestions");

  // ---------- داده‌ی محصول فقط وقتی مشتری اسمش را آورده (بخش ۳۴) ----------
  const prods = (mid) => psql(`select coalesce(meta->>'products','') from ai_requests where message_id=${mid}`);
  const general = async (text) => {
    const c = await newCustomer();
    const r = await api(c, "POST", "/api/v1/chat", { subject: "سؤال عمومی", message: text });
    const mid = r.j.messages.filter((m) => m.from === "me").at(-1).id;
    await waitFor(() => psql(`select count(*) from ai_requests where message_id=${mid}`) !== "0", 20000);
    return mid;
  };
  const JUICER = psql("select slug from products where status='published' and title_fa like 'آبمیوه%' limit 1");
  const BLENDER = psql("select slug from products where status='published' and title_fa like 'مخلوط%' limit 1");
  ok(prods(await general("این دستگاه چند واته؟")) === "[]", "general chat «این دستگاه چند واته؟» → no product");
  ok(prods(await general("می‌تونم لوگوی خودمو چاپ کنم؟")) === "[]", "general chat «چاپ لوگو» → no product (was the bag)");
  ok(prods(await general("آبمیوه‌گیری دارید؟")) === `["${JUICER}"]`, `general chat «آبمیوه‌گیری دارید؟» → juicer (${JUICER})`);
  const pc = await newCustomer();
  const inBlender = await say(pc, BLENDER, "می‌تونم لوگوی خودمو چاپ کنم؟", true);
  ok(prods(inBlender.mid) === `["${BLENDER}"]`, "product chat: only the main product (no bag)");
  const both = await say(await newCustomer(), BLENDER, "با آبمیوه‌گیری فرقش چیه؟", true);
  ok(prods(both.mid) === `["${BLENDER}", "${JUICER}"]`, `product chat: other product only when named (${prods(both.mid)})`);
  // «ساعت کاری کارشناس‌ها؟» دیگر ارجاع نمی‌شود
  const hm = await general("ساعت کاری کارشناس‌ها؟");
  ok(psql(`select outcome from ai_requests where message_id=${hm}`) !== "human", "«ساعت کاری کارشناس‌ها؟» → not a human handoff");
  const hm2 = await general("می‌خوام با کارشناس صحبت کنم");
  ok(psql(`select outcome from ai_requests where message_id=${hm2}`) === "human", "explicit request → human handoff");
} else {
  psql("delete from ai_requests where purpose='chat' and mode='live'");
  const p = await newCustomer();
  const n1 = await say(p, SLUGS[0], "[[none]] گارانتی موتور چند ساله‌ست؟", true);
  ok(sug("no_answer").includes("[[none]] گارانتی موتور چند ساله‌ست؟#1"), "no_source → suggestion no_answer");
  ok(
    psql(`select conversation_id || '|' || message_id from ai_suggestions where kind='no_answer' and conversation_id is not null limit 1`) === `${n1.conv}|${n1.mid}`,
    "suggestion links the chat",
  );
  const p2 = await newCustomer();
  await say(p2, SLUGS[1], "[[none]]  گارانتی موتور چند ساله ست؟؟", true);
  ok(sug("no_answer").includes("[[none]] گارانتی موتور چند ساله‌ست؟#2"), "same question (different spacing) → count 2");
  const p3 = await newCustomer();
  await say(p3, SLUGS[2], "[[badjson]] جنس بدنه چیه؟", true);
  ok(sug("no_answer").includes("[[badjson]] جنس بدنه چیه؟#1"), "unreadable model answer → no_answer");
  const p4 = await newCustomer();
  await say(p4, SLUGS[3], "[[leak:Foo Trading Co., Ltd]] این رو کی میسازه", true);
  ok(sug("leak").startsWith("[[leak:Foo Trading Co., Ltd]] این رو کی میسازه#1"), "guard block → leak");
  const p5 = await newCustomer();
  await say(p5, SLUGS[4], "[[handoff:restricted]] این جنس مال کجاست", true);
  ok(sug("rule_gap") === "[[handoff:restricted]] این جنس مال کجاست#1", "model handoff with a rule-covered reason → «قاعده‌ی کد نگرفت»");
  ok(psql("select detail from ai_suggestions where kind='rule_gap'").startsWith("restricted · "), "rule_gap detail starts with reason code");
  const p6 = await newCustomer();
  await say(p6, SLUGS[5], "[[handoff:other]] می‌خوام نماینده‌تون بشم", true);
  ok(sug("handoff") === "[[handoff:other]] می‌خوام نماینده‌تون بشم#1", "other model handoff → handoff");
  // تکرار، 👎 و «جواب اشتباه»
  const p7 = await newCustomer();
  const r1 = await say(p7, SLUGS[6], "وزن دستگاه چقدره؟", true);
  await say(p7, r1.conv, "وزن دستگاه چقدره؟");
  ok(sug("repeated") === "وزن دستگاه چقدره؟#1", "repeated question → repeated");
  const aiMsg = psql(`select id from chat_messages where conversation_id='${r1.conv}' and sender_type='ai' order by id limit 1`);
  const fb = await api(p7, "POST", `/api/v1/chat/${r1.conv}/feedback`, { messageId: Number(aiMsg), value: "down" });
  ok(fb.s === 200 && (await waitFor(() => sug("thumbs_down") === "وزن دستگاه چقدره؟#1")), "👎 → thumbs_down (question = customer message before the answer)");
  await ad.goto(B + `/admin/chats/${r1.conv}`);
  await ad.getByRole("button", { name: "جواب اشتباه" }).first().click();
  ok(await waitFor(() => sug("wrong") === "وزن دستگاه چقدره؟#1"), "staff «جواب اشتباه» → wrong");
  // پیشنهاد «قاعده‌ی کد نگرفت» ← آزمون با ارجاع مورد انتظار همان دلیل
  await ad.goto(B + "/admin/ai/suggestions?kind=rule_gap");
  ok(await vis(ad.getByText("قاعده‌ی کد نگرفت")), "rule_gap label shown");
  await ad.getByTestId("suggestion-row").first().getByRole("button", { name: "به آزمون" }).click();
  await ad.waitForURL(/\/admin\/ai\/tests\/[0-9a-f-]{36}$/);
  ok(psql("select expect->>'handoff' from ai_test_cases where question='[[handoff:restricted]] این جنس مال کجاست'") === "restricted", "rule_gap → test case expects that reason");

  // ---------- سقف آزمون جدا از سقف چت ----------
  // تخمین بیشتر از باقی‌مانده ← اجرا شروع نمی‌شود
  setS("ai.test_daily_cost_toman", 1000);
  await toConfirm("tricky");
  ok(
    (await vis(ad.getByText(/هزینه‌ی تخمینی از باقی‌مانده‌ی سقف امروز آزمون بیشتر است/))) && (await ad.getByRole("button", { name: "تأیید و اجرا" }).isDisabled()),
    "estimate over remaining test cap → run blocked",
  );
  // تخمین کمتر ولی هزینه‌ی واقعی بیشتر ← بقیه «رد شد (سقف)»
  psql("delete from ai_requests where purpose in ('test_run','suggest')");
  psql(`insert into ai_requests (purpose, mode, model, status, cost_toman) select 'chat', 'live', 'mock/primary', 'ok', 100 from generate_series(1, 30)`);
  const five = ["نمونه می‌فرستید؟", "FOB یعنی چی؟", "روش‌های پرداختتون چیه؟", "کارت بازرگانی لازمه؟", "حداقل سفارش این محصول چنده؟"].map(caseId);
  await toConfirm("selected", five);
  ok((await statText("هزینه‌ی تخمینی (تومان)")) === fa(500), "estimate 5 × 100");
  const capRun = await confirmRun();
  ok(await waitRun(capRun), "cap run finished");
  const cr = runRow(capRun).split("|");
  ok(cr[0] === "done" && cr[2] === "3" && cr[5] === "2" && cr[6] === "1200.00", `mid-run cap: 3 run (1200 ≥ 1000), 2 skipped (${cr.join("|")})`);
  ok(psql(`select count(*) from ai_test_results where run_id='${capRun}' and status='skipped' and path='cap'`) === "2", "skipped rows marked cap");
  await ad.goto(B + `/admin/ai/tests/runs/${capRun}`);
  ok(await vis(ad.getByText("رد شد (سقف)")), "run page: «رد شد (سقف)»");
  // چت مشتری با سقف آزمون پر و سقف چت کم ولی پرنشده ← جواب می‌دهد (سقف‌ها جدا)
  setS("ai.daily_cost_toman", 4000);
  psql("delete from ai_requests where purpose='chat'");
  const p8 = await newCustomer();
  const c1 = await say(p8, SLUGS[7], "این دستگاه چند واته؟", true);
  ok(psql(`select status from ai_requests where message_id=${c1.mid}`) === "ok", "test cap full → customer chat still answered");
  // و برعکس: سقف چت پر ← آزمون هنوز اجرا می‌شود
  setS("ai.test_daily_cost_toman", 50000);
  psql(`insert into ai_requests (purpose, mode, model, status, cost_toman) values ('chat', 'live', 'mock/primary', 'ok', 5000)`);
  const c2 = await say(p8, c1.conv, "رنگ‌بندی هم داره؟");
  ok(psql(`select outcome from ai_requests where message_id=${c2.mid}`) === "global_cap", "chat cap full → chat handed off");
  await toConfirm("selected", [five[0]]);
  ok(!(await ad.getByRole("button", { name: "تأیید و اجرا" }).isDisabled()), "chat cap full → test run still allowed");
  const one = await confirmRun();
  ok((await waitRun(one)) && runRow(one).startsWith("done|1|1|"), "test ran with chat cap full");
  setS("ai.daily_cost_toman", 50000);

  // ---------- توقف ----------
  psql(`insert into ai_test_cases (question, category, status, source) select '[[slow]] سؤال کند ' || g || ' ${run}', 'normal', 'draft', 'manual' from generate_series(1, 4) g`);
  const slow = psql(`select string_agg(id::text, ',') from ai_test_cases where question like '[[slow]]%${run}'`).split(",");
  await toConfirm("selected", slow);
  const sr = await confirmRun();
  await waitFor(() => psql(`select done from ai_test_runs where id='${sr}'`) === "1", 20000);
  await ad.getByRole("button", { name: "توقف" }).click();
  ok(await waitRun(sr, 20000), "stopped run ended");
  const s = runRow(sr).split("|");
  ok(s[0] === "stopped" && Number(s[2]) < 4 && Number(s[2]) + Number(s[5]) === 4, `stop: remaining skipped (${s.join("|")})`);
  ok(psql(`select count(*) from ai_test_results where run_id='${sr}' and path='stop'`) === s[5], "skipped rows marked stop");
  await ad.goto(B + `/admin/ai/tests/runs/${sr}`);
  ok((await ad.getByTestId("run-status").innerText()).includes("متوقف شد"), "run page: stopped");
}

// ---------- اجرای قطع‌شده (زمان‌بند هر دقیقه) ----------
if (!LIVE) {
  const id = psql(
    `insert into ai_test_runs (status, mode, scope, model, prompt_version, total, heartbeat_at) values ('running', 'test', '{"kind":"all"}', 'test/fake', 'x', 1, now() - interval '10 minutes') returning id`,
  ).split("\n")[0];
  psql(`insert into ai_test_results (run_id, question, expect) values ('${id}', 'q', '{"handoff":null,"source":null,"forbidden":[],"mustInclude":[]}')`);
  ok(await waitFor(() => psql(`select status from ai_test_runs where id='${id}'`) === "interrupted", 75000), "stale running run → interrupted by scheduler");
  ok(psql(`select status || '|' || path from ai_test_results where run_id='${id}'`) === "skipped|interrupted", "its pending rows → skipped");
}

// ---------- دسترسی‌ها ----------
{
  setS("auth.enforce_permissions", true);
  const ex = await page();
  await expert(ex);
  await ex.goto(B + "/admin/ai/tests");
  ok(!ex.url().includes("/admin/ai/tests") || (await ex.getByText("دسترسی").count()) > 0, "expert without ai.tests: tests page blocked");
  await ex.goto(B + "/admin/ai/suggestions");
  ok(!ex.url().includes("/admin/ai/suggestions") || (await ex.getByText("دسترسی").count()) > 0, "expert without ai.knowledge/ai.tests: suggestions blocked");
  ok((await ex.locator("nav").getByText("آزمون دستیار").count()) === 0, "expert: no tests nav item");
  // فقط ai.knowledge ← پیشنهادها بله، «به آزمون» و «پیشنهاد AI» نه
  psql("insert into role_permissions (role_id, permission_key) select r.id, 'ai.knowledge' from roles r where r.key='expert' on conflict do nothing");
  await ex.goto(B + "/admin/ai/suggestions");
  ok(ex.url().endsWith("/admin/ai/suggestions") && (await vis(ex.getByRole("heading", { name: "پیشنهاد سؤال تازه" }))), "ai.knowledge: suggestions page");
  ok(
    (await ex.getByRole("button", { name: "به آزمون" }).count()) === 0 && (await ex.getByText("پیشنهاد سؤال فریبنده با AI").count()) === 0,
    "ai.knowledge only: no test conversion, no AI suggestion",
  );
  ok((await ex.getByText("آزمون کامل دستیار").count()) === 0, "no test banner without ai.tests");
  psql("delete from role_permissions where permission_key='ai.knowledge' and role_id=(select id from roles where key='expert')");
  setS("auth.enforce_permissions", false);
}

setS("features.ai_agent", false);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
mock?.kill();
done();
process.exit();
