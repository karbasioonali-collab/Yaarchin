// دستیار هوشمند (PR ۱) روی دیتابیس بعد از migration ۰۰۱۰ + seed. دو حالت، هرکدام با سرور جدا:
//   AI_E2E=test ← سرور بدون AI_BASE_URL/AI_API_KEY (حالت آزمایشی)
//   AI_E2E=live ← سرور با AI_BASE_URL=http://127.0.0.1:3399/v1 AI_API_KEY=test AI_MODEL=mock/primary AI_FALLBACK_MODEL=mock/fallback
//                 (این تست خودش سرور ساختگی tests/e2e/mock-ai.mjs را روی :3399 بالا می‌آورد)
// اجرا: TEST_DB=postgres://…/yarchin_full AI_E2E=live node tests/e2e/ai.e2e.mjs
import { spawn } from "node:child_process";
import { B, admin, api, customer, done, expert, launch, ok, psql, setS, sleep, vis, waitFor } from "./lib.mjs";

const MODE = process.env.AI_E2E;
if (MODE !== "live" && MODE !== "test") throw new Error("AI_E2E=live یا test");
const MOCK = "http://127.0.0.1:3399";
const run = Date.now().toString(36);

psql("update settings set value='true' where key='features.chat'");
setS("features.ai_agent", false);
for (const [k, v] of Object.entries({
  max_replies_per_chat: 12,
  customer_daily_messages: 40,
  daily_requests: 1500,
  daily_cost_toman: 50000,
  big_order_qty: 5000,
  lead_score_handoff: 80,
  resume_after_hours: 24,
  kb_review_days: 30,
}))
  setS(`ai.${k}`, v);
// مصرف امروز از اجرای قبلی تست روی سقف‌ها اثر نگذارد
psql("delete from ai_requests where mode='live'");
const SLUGS = psql("select slug from products where status='published' order by slug").split("\n");
const COMPANY = psql("select name_en from companies order by created_at limit 1");

let mock;
if (MODE === "live") {
  // stdout بسته: اگر تست وسط کار بشکند، mock خروجی run-all را باز نگه ندارد؛ با خروج تست هم بسته می‌شود
  mock = spawn(process.execPath, [new URL("./mock-ai.mjs", import.meta.url).pathname, "3399"], { stdio: ["ignore", "ignore", "inherit"] });
  process.on("exit", () => mock.kill());
  await sleep(500);
}
const mockLog = async () => await (await fetch(MOCK + "/__log")).json();

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);

let nCust = 0;
const newCustomer = async () => {
  const p = await page();
  const email = `ai-${MODE}-${run}-${++nCust}@example.com`;
  const id = await customer(p, email, `AI Customer ${nCust}`);
  return { p, id };
};
// پیام مشتری؛ اگر wait، صبر تا ایجنت کارش با این پیام تمام شود (ردیف ai_requests یا ساکت شدن)
const say = async (p, convOrSlug, text, { wait = true, isNew = false } = {}) => {
  const r = isNew ? await api(p, "POST", "/api/v1/chat", { product: convOrSlug, message: text }) : await api(p, "POST", `/api/v1/chat/${convOrSlug}`, { message: text });
  if (r.s !== 200) throw new Error(`post failed ${r.s} ${JSON.stringify(r.j)}`);
  const conv = r.j.conversation.id;
  const mid = r.j.messages.filter((m) => m.from === "me").at(-1).id;
  if (wait)
    await waitFor(
      () =>
        psql(`select count(*) from ai_requests where message_id=${mid}`) !== "0" &&
        psql(`select coalesce(thinking_since::text,'') from ai_conversation_state where conversation_id='${conv}'`) === "",
      20000,
    );
  await sleep(300);
  return { conv, mid, typing: r.j.assistantTyping };
};
const aiMsgs = (conv) => psql(`select count(*) from chat_messages where conversation_id='${conv}' and sender_type='ai'`);
const lastAi = (conv) => psql(`select body || '|' || visible_to_customer from chat_messages where conversation_id='${conv}' and sender_type='ai' order by id desc limit 1`);
const st = (conv) => psql(`select mode || '|' || coalesce(silenced_reason,'') || '|' || replies from ai_conversation_state where conversation_id='${conv}'`);
const flags = (conv) => psql(`select flag || ':' || reason from conversation_flags where conversation_id='${conv}' and resolved_at is null order by id`);
const req = (mid) =>
  psql(
    `select status || '|' || coalesce(outcome,'') || '|' || coalesce(model,'') || '|' || fallback_used || '|' || cost_toman from ai_requests where message_id=${mid} order by id desc limit 1`,
  );
const unassignedHas = async (conv) => {
  await ad.goto(B + "/admin/chats?tab=unassigned");
  return (await ad.locator(`a[href="/admin/chats/${conv}"]`).count()) > 0;
};

// ---------- سوئیچ خاموش ----------
{
  const { p } = await newCustomer();
  const { conv, typing } = await say(p, SLUGS[0], "سلام، حداقل سفارش چنده؟", { isNew: true, wait: false });
  await sleep(1500);
  ok(!typing && psql(`select count(*) from ai_conversation_state where conversation_id='${conv}'`) === "0" && aiMsgs(conv) === "0", "switch off: no assistant at all");
  ok(await unassignedHas(conv), "switch off: chat in unassigned queue as before");
  await ad.goto(B + "/admin/ai");
  const btn = ad.getByRole("button", { name: "تست اتصال" });
  if (MODE === "test") ok(await btn.isDisabled(), "test mode: connection test button disabled (no key)");
  else {
    // راه‌اندازی صاحب سایت: کلید وارد شده، سوئیچ خاموش ← فقط «تست اتصال»
    await btn.click();
    ok(await vis(ad.getByText("✓ همه‌چیز درست کار می‌کند."), 30000), "connection test with switch off: all steps pass");
    ok(psql("select count(*) from ai_requests where purpose='connection_test'") !== "0", "connection test logged in ai_requests");
    const lg = await mockLog();
    ok(lg.some((x) => x.tool_choice?.function?.name === "landed_cost") && lg.some((x) => x.model === "mock/fallback"), "connection test: forced tool call + fallback model tried");
    ok(psql("select value from settings where key='features.ai_agent'") === "false", "connection test did not turn assistant on");
    ok((await ad.locator("nav").getByText("در دست دستیار").count()) === 0, "switch off: no assistant tab");
  }
}

setS("features.ai_agent", true);
const LIVE = MODE === "live";

if (!LIVE) {
  // ---------- حالت آزمایشی: همه‌چیز فقط داخلی ----------
  const { p } = await newCustomer();
  const kbQ = psql("select question from kb_items order by created_at limit 1");
  psql("update kb_items set status='active', answer='جواب آزمایشی پایگاه دانش.' where question=" + `'${kbQ.replace(/'/g, "''")}'`);
  const a = await say(p, SLUGS[1], kbQ, { isNew: true });
  ok(!a.typing, "test mode: no typing indicator for customer");
  ok(lastAi(a.conv).startsWith("[آزمایشی — مشتری نمی‌بیند]") && lastAi(a.conv).endsWith("|false"), `test mode: internal reply only (${lastAi(a.conv).slice(0, 60)})`);
  const cust = await api(p, "GET", `/api/v1/chat/${a.conv}`);
  ok(
    cust.j.messages.every((m) => m.from !== "ai"),
    "test mode: customer sees no assistant message",
  );
  ok(await unassignedHas(a.conv), "test mode: chat still in unassigned queue");
  ok(req(a.mid).includes("test/fake"), "test mode: fake model, logged");
  const h = await say(p, a.conv, "پیش فاکتور می‌خوام");
  ok(flags(h.conv).includes("needs_expert:آزمایشی: درخواست پیش‌فاکتور یا فاکتور"), "test mode: proforma handoff flag (prefixed)");
  const { p: p2 } = await newCustomer();
  const l = await say(p2, SLUGS[2], "[[leak]] این محصول کار کیه؟", { isNew: true });
  ok(flags(l.conv).startsWith("needs_review:آزمایشی: احتمال افشای اطلاعات"), "test mode: [[leak]] blocked by guard");
  const { p: p3 } = await newCustomer();
  const t = await say(p3, SLUGS[3], "[[timeout]] زمان تحویل چقدره؟", { isNew: true });
  ok(req(t.mid).split("|")[3] === "1", "test mode: [[timeout]] → fallback");
  await ad.goto(B + `/admin/chats/${a.conv}`);
  ok(await vis(ad.getByText("حالت آزمایشی (فقط داخلی)").or(ad.getByText("ساکت (با کارشناس)"))), "test mode: assistant card on chat page");
  ok((await ad.locator("nav").getByText("در دست دستیار").count()) === 0, "test mode: no assistant tab (only live)");
  // جواب آماده و تلاش دوباره در حالت آزمایشی (بخش ۳۱)
  const { p: p4 } = await newCustomer();
  const g = await say(p4, SLUGS[4], "سلام", { isNew: true });
  ok(
    req(g.mid).startsWith("ok|pleasantry||") && lastAi(g.conv).startsWith("[آزمایشی — مشتری نمی‌بیند] سلام") && lastAi(g.conv).endsWith("|false"),
    "test mode: greeting → internal canned reply",
  );
  const r1 = await say(p4, g.conv, "[[badjson1]] رنگش چیه؟");
  ok(req(r1.mid).startsWith("ok|") && psql(`select meta->>'retry' from ai_requests where message_id=${r1.mid}`) === "1", "test mode: bad format once → retry succeeds");
} else {
  // ---------- زنده ----------
  // ۱. جواب عادی + نشانگر نوشتن + خارج از صف ارجاع‌نشده + تب «در دست دستیار»
  const A = await newCustomer();
  const a1 = await say(A.p, SLUGS[0], "سلام حداقل سفارش و زمان تحویلش چقدره؟ [[slow]]", { isNew: true, wait: false });
  ok(a1.typing === true, "live: POST returns assistantTyping");
  const poll = await api(A.p, "GET", `/api/v1/chat/${a1.conv}`);
  ok(poll.j.assistantTyping === true, "live: polling shows typing while model works");
  ok(!(await unassignedHas(a1.conv)), "live: AI chat not in unassigned queue");
  await ad.goto(B + "/admin/chats?tab=ai");
  ok((await ad.locator(`a[href="/admin/chats/${a1.conv}"]`).count()) > 0, "live: chat in «در دست دستیار» tab");
  await waitFor(() => aiMsgs(a1.conv) !== "0", 15000);
  ok(lastAi(a1.conv) === "پاسخ ساختگی مدل اصلی.|true", "live: assistant reply visible to customer");
  ok(req(a1.mid) === "ok|knowledge|mock/primary|0|400.00", `live: request logged with cost (${req(a1.mid)})`);
  // UI مشتری: نام دستیار، 👍/👎
  await A.p.goto(B + `/account/chats/${a1.conv}`);
  ok(await vis(A.p.getByText("دستیار هوشمند یارچین")), "customer UI: assistant name");
  await A.p.getByRole("button", { name: "جواب مفید نبود" }).first().click();
  ok(await waitFor(() => psql(`select count(*) from ai_feedback where value='down' and source='customer'`) !== "0"), "👎 saved");
  ok(flags(a1.conv).includes("👎"), "👎 → needs_review flag");
  await A.p.getByRole("button", { name: "جواب مفید بود" }).first().click();
  ok(
    await waitFor(() => psql(`select value from ai_feedback f join chat_messages m on m.id=f.message_id where m.conversation_id='${a1.conv}' and f.source='customer'`) === "up"),
    "👍 replaces 👎 (one vote per message)",
  );

  // ۲. ماشین‌حساب: با تعداد ← قیمت از قبل در داده‌ها و فقط یک درخواست بدون ابزار (بخش ۳۲)
  const n2 = (await mockLog()).length;
  const a2 = await say(A.p, a1.conv, "[[tool]] برای ۲۰۰ عدد هزینه‌ی تمام‌شده چقدر میشه؟");
  ok(req(a2.mid).startsWith("ok|calculator|"), `live: qty in message → calculator (${req(a2.mid)})`);
  const calls2 = (await mockLog()).slice(n2);
  ok(
    calls2.length === 1 && !calls2[0].tools && calls2[0].messages.at(-1).content.includes("landed_cost_for_requested_qty"),
    "qty → price precomputed: one model call, no tools sent",
  );
  ok(psql(`select meta->>'precomputedQty' from ai_requests where message_id=${a2.mid}`) === "200", "precomputed qty logged");
  ok(lastAi(a2.conv).includes("این قیمت تخمینی است") && /200|۲۰۰/.test(lastAi(a2.conv)), "calculator answer shown");
  ok(st(a1.conv) === "ai||2", `replies counted (${st(a1.conv)})`);
  // سؤال قیمت بدون تعداد ← ابزار فرستاده می‌شود و مدل صدایش می‌زند (دو درخواست)
  {
    const T = await newCustomer();
    const n3 = (await mockLog()).length;
    const t1 = await say(T.p, SLUGS[3], "[[tool]] قیمت تمام‌شده‌اش تا ایران چقدره؟", { isNew: true });
    const calls3 = (await mockLog()).slice(n3);
    ok(
      req(t1.mid).startsWith("ok|calculator|") && calls3.length === 2 && !!calls3[0].tools && calls3[1].messages.some((m) => m.role === "tool"),
      "price without qty → tool sent, tool round (2 calls)",
    );
    // سؤال غیرقیمتی ← بدون ابزار؛ دستورالعمل انگلیسی؛ سقف خروجی ۴۰۰؛ داده‌ی فشرده
    const n4 = (await mockLog()).length;
    await say(T.p, t1.conv, "[[cached:800]] این دستگاه چند واته؟");
    const c4 = (await mockLog()).slice(n4)[0];
    const data = c4.messages.at(-1).content;
    ok(!c4.tools && c4.max_tokens === 400, "non-price question: no tools, max_tokens 400");
    ok(c4.messages[0].content.startsWith("You are") && c4.messages[0].content.includes("source:"), "system prompt is English with line format");
    ok(data.startsWith("SITE DATA") && !data.includes("landedAtMoq") && !data.includes(":null"), "site data: no price block for non-price question, no nulls");
    ok(psql(`select meta->>'cachedTokens' from ai_requests where conversation_id='${t1.conv}' order by id desc limit 1`) === "800", "cached tokens recorded");
  }

  // ۳. «جواب اشتباه» کارشناس
  await ad.goto(B + `/admin/chats/${a1.conv}`);
  ok(await vis(ad.getByText("از ماشین‌حساب")), "staff UI: AI source tag");
  await ad.getByRole("button", { name: "جواب اشتباه" }).first().click();
  ok(await waitFor(() => psql("select count(*) from ai_feedback where source='staff' and value='wrong'") !== "0"), "staff «جواب اشتباه» saved");

  // ۴. سقف جواب هر گفتگو
  setS("ai.max_replies_per_chat", 2);
  const a3 = await say(A.p, a1.conv, "یه سؤال دیگه هم دارم");
  ok(st(a1.conv).startsWith("human|handoff:long_chat"), `long chat cap → handoff (${st(a1.conv)})`);
  ok(lastAi(a1.conv).startsWith("پیام شما به کارشناس یارچین سپرده شد") && (await unassignedHas(a1.conv)), "handoff message + back in unassigned queue");
  ok(psql(`select count(*) from chat_messages where conversation_id='${a3.conv}' and meta->>'event'='ai_handoff'`) === "1", "ai_handoff event (pulse)");
  setS("ai.max_replies_per_chat", 12);
  const a4 = await say(A.p, a1.conv, "هنوز کسی نیومد؟", { wait: false });
  await sleep(1500);
  ok(psql(`select count(*) from ai_requests where message_id=${a4.mid}`) === "0" && !a4.typing, "silenced chat: assistant stays quiet");

  // ۵. ارجاع‌های قطعی (بدون مدل)
  const before = (await mockLog()).length;
  for (const [i, [text, reason, label]] of [
    ["لطفاً پیش فاکتور بفرستید", "proforma", "درخواست پیش‌فاکتور یا فاکتور"],
    ["تخفیف هم میدین؟", "discount", "درخواست تخفیف"],
    ["می‌خوام با کارشناس صحبت کنم", "human", "مشتری کارشناس خواست"],
    ["۱۰۰۰۰ عدد می‌خوام", "big_order", "سفارش بزرگ"],
  ].entries()) {
    const C = await newCustomer();
    const r = await say(C.p, SLUGS[1 + i], text, { isNew: true });
    ok(st(r.conv).startsWith(`human|handoff:${reason}`) && flags(r.conv) === `needs_expert:${label}`, `rule handoff: ${reason}`);
  }
  {
    const C = await newCustomer();
    const r = await say(C.p, SLUGS[5], "اسم کارخانه‌اش چیه؟ از علی بابا میخرید؟", { isNew: true });
    ok(
      lastAi(r.conv) === "این بخش از خدمات یارچین است و کارشناس یارچین در همین گفتگو کمکتان می‌کند.|true" && st(r.conv).startsWith("human|handoff:restricted"),
      "restricted: fixed text + handoff",
    );
  }
  // سؤال هویت کارخانه با شکل‌های دیگر ← قاعده‌ی کد، بدون مدل (بخش ۳۲)
  for (const [i, q] of ["سازنده‌اش کیه؟", "از کدوم کارخونه می‌خرید؟", "supplier name please"].entries()) {
    const C = await newCustomer();
    const r = await say(C.p, SLUGS[6 + i], q, { isNew: true });
    ok(st(r.conv).startsWith("human|handoff:restricted"), `supplier identity by rule: ${q}`);
  }
  ok((await mockLog()).length === before, "rule handoffs never call the model");
  {
    // برند خود مشتری ← نه ارجاع، به مدل می‌رود
    const C = await newCustomer();
    const r = await say(C.p, SLUGS[9], "میشه اسم برند خودم رو روش چاپ کنید؟", { isNew: true });
    ok(req(r.mid).startsWith("ok|") && (await mockLog()).length === before + 1, "own-brand printing question → model, not handoff");
  }

  // ۶. محافظ خروجی (اسم کارخانه‌ی ثبت‌شده)
  {
    const C = await newCustomer();
    const r = await say(C.p, SLUGS[6], `[[leak:${COMPANY.replace(/,? Co\., Ltd\.?$/, "")}]] سلام`, { isNew: true });
    ok(lastAi(r.conv) === "کارشناس یارچین به‌زودی به این پیام پاسخ می‌دهد.|true", "guard: blocked answer replaced");
    const cust = await api(C.p, "GET", `/api/v1/chat/${r.conv}`);
    ok(!JSON.stringify(cust.j).includes("تولید می‌کند"), "guard: leaked text never reaches customer");
    ok(req(r.mid).startsWith("guard_block|leak") && flags(r.conv).startsWith("needs_review:احتمال افشای اطلاعات"), "guard: logged + needs_review flag");
  }

  // ۷. خطاها و مدل پشتیبان
  {
    const C = await newCustomer();
    const r = await say(C.p, SLUGS[7], "[[primary500]] سلام زمان تحویل؟", { isNew: true });
    ok(req(r.mid).startsWith("ok|knowledge|mock/fallback|1") && lastAi(r.conv) === "پاسخ ساختگی مدل پشتیبان.|true", "primary 500 → fallback model answers");
    const r2 = await say(C.p, r.conv, "[[notools]] جنسش چیه؟");
    ok(req(r2.mid).startsWith("ok|knowledge|mock/primary|0"), "tools rejected (400) → retried without tools");
    const r3 = await say(C.p, r.conv, "[[down]] سلام؟");
    ok(req(r3.mid).startsWith("error|error") && st(r.conv).startsWith("human|handoff:error"), "both models down → handoff");
  }
  {
    const C = await newCustomer();
    const r = await say(C.p, SLUGS[8], "[[badjson]] سلام", { isNew: true });
    ok(req(r.mid).startsWith("parse_error|parse") && flags(r.conv).startsWith("needs_review:"), "bad JSON → handoff + needs_review");
    const C2 = await newCustomer();
    const r2 = await say(C2.p, SLUGS[9], "[[none]] گارانتی دارید؟", { isNew: true });
    ok(st(r2.conv).startsWith("human|handoff:no_source"), "model no_source → handoff");
  }

  // ۸. ساکت شدن با پیام کارشناس و برگرداندن به دستیار
  {
    const F = await newCustomer();
    const r = await say(F.p, SLUGS[0], "سلام وزن بسته چقدره؟", { isNew: true });
    await ad.goto(B + `/admin/chats/${r.conv}`);
    await ad.getByLabel("پاسخ").fill("سلام، من کارشناس هستم.");
    await ad.getByLabel("پاسخ").press("Enter");
    ok(await waitFor(() => st(r.conv).startsWith("human|staff_reply")), "staff reply silences assistant");
    const r2 = await say(F.p, r.conv, "ممنون، یه سؤال دیگه", { wait: false });
    await sleep(1500);
    ok(psql(`select count(*) from ai_requests where message_id=${r2.mid}`) === "0", "after staff reply: no AI answer");
    await ad.reload();
    await ad.getByRole("button", { name: "برگرداندن به دستیار" }).click();
    ok(await waitFor(() => st(r.conv).startsWith("ai|")), "«برگرداندن به دستیار» resumes");
    const r3 = await say(F.p, r.conv, "رنگ‌بندی داره؟");
    ok(req(r3.mid).startsWith("ok|"), "resumed: assistant answers again");
    // ارجاع به کارشناس خاص (assigned) ← ساکت
    psql(`update conversations set assigned_to=(select id from users where email='expert@test.local') where id='${r.conv}'`);
    const r4 = await say(F.p, r.conv, "سلام دوباره", { wait: false });
    await sleep(1500);
    ok(st(r.conv).startsWith("human|assigned") && psql(`select count(*) from ai_requests where message_id=${r4.mid}`) === "0", "assigned chat → assistant silenced");
  }
  // ۹. باز شدن دوباره‌ی گفتگوی بسته بعد از resume_after_hours
  {
    const G = await newCustomer();
    const r = await say(G.p, SLUGS[2], "تخفیف دارید؟", { isNew: true });
    psql(`update ai_conversation_state set silenced_at=now()-interval '25 hours' where conversation_id='${r.conv}'`);
    psql(`update conversations set status='closed', closed_at=now() where id='${r.conv}'`);
    const r2 = await say(G.p, r.conv, "سلام، جنس بدنه‌اش چیه؟");
    ok(req(r2.mid).startsWith("ok|") && st(r.conv).startsWith("ai|"), "reopened after 24h → assistant resumes");
    const H = await newCustomer();
    const h = await say(H.p, SLUGS[3], "تخفیف دارید؟", { isNew: true });
    psql(`update conversations set status='closed', closed_at=now() where id='${h.conv}'`);
    const h2 = await say(H.p, h.conv, "سلام دوباره", { wait: false });
    await sleep(1500);
    ok(psql(`select count(*) from ai_requests where message_id=${h2.mid}`) === "0", "reopened within 24h → stays with expert");
  }
  // ۱۰. سقف پیام روزانه‌ی مشتری
  {
    setS("ai.customer_daily_messages", 1);
    const K = await newCustomer();
    const r = await say(K.p, SLUGS[4], "سلام ابعادش چقدره؟", { isNew: true });
    const r2 = await say(K.p, r.conv, "وزنش؟");
    ok(req(r.mid).startsWith("ok|") && st(r2.conv).startsWith("human|handoff:customer_cap"), "customer daily cap → handoff");
    setS("ai.customer_daily_messages", 40);
  }
  // ۱۱. سقف هزینه‌ی روزانه + هشدار ۸۰٪
  {
    const cost = Number(psql("select coalesce(sum(cost_toman),0) from ai_requests where mode='live'"));
    setS("ai.daily_cost_toman", Math.ceil(cost / 0.9));
    await ad.goto(B + "/admin");
    ok(await vis(ad.getByText(/سقف هزینه‌ی روزانه را مصرف کرده/)), "80% cost warning banner");
    setS("ai.daily_cost_toman", Math.max(1, Math.floor(cost) - 1));
    const L = await newCustomer();
    const r = await say(L.p, SLUGS[5], "سلام جنسش چیه؟", { isNew: true });
    ok(st(r.conv).startsWith("human|handoff:global_cap"), "daily cost cap → handoff");
    setS("ai.daily_cost_toman", 50000);
    await ad.goto(B + "/admin/ai");
    ok(await vis(ad.getByText("آخرین درخواست‌ها")), "/admin/ai: requests table");
  }
  // ۱۱٫۵ احوال‌پرسی (جواب آماده، بدون مدل) و قالب‌های مختلف جواب مدل (بخش ۳۱)
  {
    const title = psql(`select title_fa from products where slug='${SLUGS[8]}'`);
    const Q = await newCustomer();
    const n0 = (await mockLog()).length;
    const g = await say(Q.p, SLUGS[8], "سلام وقت بخیر 🌹", { isNew: true });
    ok(req(g.mid) === "ok|pleasantry||0|0.00" && lastAi(g.conv).includes(`«${title}»`) && lastAi(g.conv).endsWith("|true"), "greeting → canned reply with product name, no cost");
    const t = await say(Q.p, g.conv, "ممنون 🙏");
    ok(lastAi(t.conv) === "خواهش می‌کنم! اگر سؤال دیگری داشتید، همین‌جا بپرسید.|true", "thanks → canned reply");
    await say(Q.p, g.conv, "سلام");
    ok((await mockLog()).length === n0 && st(g.conv) === "ai||0" && flags(g.conv) === "", "pleasantries: no model call, not counted, no repeat flag, no handoff");
    const cust = await api(Q.p, "GET", `/api/v1/chat/${g.conv}`);
    ok(
      cust.j.messages.filter((m) => m.from === "ai").every((m) => !m.rate),
      "canned replies have no 👍/👎",
    );
    const q = await say(Q.p, g.conv, "سلام، قیمتش چنده؟");
    ok((await mockLog()).length > n0 && req(q.mid).startsWith("ok|knowledge|mock/primary"), "greeting + question → model");
    // متن آماده از پنل
    await ad.goto(B + "/admin/ai");
    await ad.locator('textarea[name="greetingProduct"]').fill("درود! درباره‌ی {product} بپرسید.");
    await ad
      .locator("form", { has: ad.locator('textarea[name="greetingProduct"]') })
      .getByRole("button", { name: "ذخیره" })
      .click();
    ok(
      await waitFor(() => psql("select value #>> '{}' from settings where key='ai.reply_greeting_product'") === "درود! درباره‌ی {product} بپرسید."),
      "canned text saved from panel",
    );
    const Q2 = await newCustomer();
    const g2 = await say(Q2.p, SLUGS[9], "درود", { isNew: true });
    ok(lastAi(g2.conv) === `درود! درباره‌ی ${psql(`select title_fa from products where slug='${SLUGS[9]}'`)} بپرسید.|true`, "edited canned text used");
    setS(
      "ai.reply_greeting_product",
      "سلام، وقت‌تان بخیر! من دستیار هوشمند یارچین هستم. درباره‌ی «{product}» هر سؤالی دارید بپرسید؛ مثلاً مشخصات، حداقل سفارش، زمان رسیدن یا قیمت تخمینی تا ایران برای تعداد دلخواه.",
    );
    // قالب‌ها
    const F2 = await newCustomer();
    const f0 = await say(F2.p, SLUGS[0], "[[badjson1]] رنگ‌بندی؟", { isNew: true });
    const n1 = (await mockLog()).length;
    ok(
      req(f0.mid).startsWith("ok|knowledge|mock/primary") && psql(`select meta->>'retry' from ai_requests where message_id=${f0.mid}`) === "1",
      "bad format once → format reminder → answered",
    );
    ok((await mockLog()).at(-1).messages.at(-1).content.includes("did not follow the output format"), "retry carries format reminder");
    const f1 = await say(F2.p, f0.conv, "[[greetsrc]] سلام دوباره؟");
    ok(req(f1.mid).startsWith("ok|general|"), "unknown source (greeting) → retry → general");
    const f2 = await say(F2.p, f0.conv, "[[fenced]] سؤال؟");
    ok(
      lastAi(f2.conv) === "جواب {داخل} fence.|true" && psql(`select meta->>'retry' from ai_requests where message_id=${f2.mid}`) === "",
      "```json fence + prose → parsed without retry",
    );
    const f3 = await say(F2.p, f0.conv, "[[newline]] سؤال دوم؟");
    ok(lastAi(f3.conv) === "خط اول\nخط دوم|true", "raw newline inside JSON string → parsed");
    const f4 = await say(F2.p, f0.conv, "[[badjson]] سؤال سوم؟");
    ok(
      req(f4.mid).startsWith("parse_error|parse") &&
        psql(`select jsonb_array_length(meta->'raw') from ai_requests where message_id=${f4.mid}`) === "2" &&
        st(f0.conv).startsWith("human|handoff:parse"),
      "still bad after retry → handoff, both raw outputs stored",
    );
    ok(n1 > 0 && psql(`select (cost_toman > 400)::text from ai_requests where message_id=${f4.mid}`) === "true", "retry cost added to request");
    await ad.goto(B + "/admin/ai");
    const raw = ad.locator("details", { hasText: "خروجی خام مدل" }).first();
    await raw.locator("summary").click();
    ok(await vis(raw.getByText("سلام! این JSON نیست.")), "panel shows raw model output");
  }

  // ۱۲. هیچ داده‌ی کارخانه یا HS code در پیام‌های فرستاده به مدل
  {
    const lg = (await mockLog()).filter((x) => !JSON.stringify(x).includes("[[leak"));
    const all = JSON.stringify(lg);
    const names = psql("select name_en from companies").split("\n").filter(Boolean);
    ok(!names.some((n) => all.includes(n)) && !/hs_?code|hsCode|supplier|usd/i.test(all), "prompts never contain factory names, HS codes, suppliers or USD prices");
    ok(lg.filter((x) => x.messages?.[0]?.content?.includes("دستیار هوشمند یارچین")).length > 0, "system prompt sent");
  }
  // ۱۳. گیر کردن (۹۰ ثانیه) ← زمان‌بند ارجاع می‌دهد
  {
    const M = await newCustomer();
    const r = await say(M.p, SLUGS[6], "سلام قیمتش؟", { isNew: true });
    psql(`update ai_conversation_state set mode='ai', silenced_at=null, silenced_reason=null, thinking_since=now()-interval '2 minutes' where conversation_id='${r.conv}'`);
    ok(await waitFor(() => st(r.conv).startsWith("human|handoff:stuck"), 75000), "stuck >90s → scheduler hands off");
  }
  // ۱۴. خاموش کردن سوئیچ ← همه به صف برمی‌گردند
  {
    const N = await newCustomer();
    const r = await say(N.p, SLUGS[7], "سلام مشخصاتش؟", { isNew: true });
    psql(`update ai_conversation_state set mode='ai' where conversation_id='${r.conv}'`);
    ok(!(await unassignedHas(r.conv)), "AI chat hidden from unassigned while live");
    setS("features.ai_agent", false);
    ok(await unassignedHas(r.conv), "switch off → AI chats back in unassigned queue");
    const r2 = await say(N.p, r.conv, "سلام؟", { wait: false });
    await sleep(1500);
    ok(psql(`select count(*) from ai_requests where message_id=${r2.mid}`) === "0", "switch off → assistant silent at once");
    setS("features.ai_agent", true);
  }
  // ۱۵. گزارش
  await ad.goto(B + "/admin/reports");
  ok((await ad.locator("body").innerText()).includes("👎") || (await vis(ad.getByText(/👎|ناراضی/))), "report shows 👎 stat");
}

// ---------- پایگاه دانش (هر دو حالت) ----------
{
  await ad.goto(B + "/admin/ai/knowledge");
  ok(await vis(ad.getByText("نیاز به بررسی مجدد")), "KB page loads");
  await ad.getByText("+ مورد تازه").click();
  const q = `سؤال تست ${run}`;
  const form = ad.locator("details form");
  await form.locator('input[name="question"]').fill(q);
  await form.locator('textarea[name="answer"]').fill("جواب [تکمیل شود]");
  await form.locator('select[name="status"]').selectOption("active");
  await form.getByRole("button", { name: "ذخیره" }).click();
  ok(await vis(ad.getByText(/تکمیل شود.*اول کاملش کنید/)), "KB: active item with «[تکمیل شود]» rejected");
  await form.locator('textarea[name="answer"]').fill("جواب کامل تست.");
  await form.getByRole("button", { name: "ذخیره" }).click();
  ok(await waitFor(() => psql(`select status from kb_items where question='${q}'`) === "active"), "KB: item created");
  const id = psql(`select id from kb_items where question='${q}'`);
  await ad.goto(B + `/admin/ai/knowledge/${id}`);
  await ad.locator('textarea[name="answer"]').fill("جواب ویرایش‌شده.");
  await ad.getByRole("button", { name: "ذخیره" }).click();
  ok(await waitFor(() => psql(`select count(*) from kb_item_versions where item_id='${id}'`) === "2"), "KB: edit → version history");
  psql(`update kb_items set last_reviewed_at=now()-interval '40 days' where id='${id}'`);
  await ad.goto(B + "/admin");
  ok(await vis(ad.getByText(/مورد پایگاه دانش دستیار بیش از بازه/)), "KB overdue banner");
  await ad.goto(B + "/admin/ai/knowledge?filter=overdue");
  await ad.locator("tr", { hasText: q }).getByRole("button", { name: "بررسی شد، درست است" }).click();
  ok(await waitFor(() => psql(`select last_reviewed_at > now()-interval '1 minute' from kb_items where id='${id}'`) === "t"), "KB: «بررسی شد» updates review date");
}

// ---------- دسترسی ----------
{
  // با سوئیچ «اجرای دسترسی‌ها» روشن (خاموش = همه‌ی کاربران پنل همه‌جا)
  setS("auth.enforce_permissions", true);
  const ex = await page();
  await expert(ex);
  const r = await ex.goto(B + "/admin/ai");
  ok(r.status() === 403 || r.status() === 404 || !ex.url().endsWith("/admin/ai") || (await ex.getByText("دسترسی").count()) > 0, "expert without ai.settings cannot open /admin/ai");
  ok((await ex.locator("nav").getByText("پایگاه دانش دستیار").count()) === 0, "expert: no KB nav item");
  setS("auth.enforce_permissions", false);
}

setS("features.ai_agent", false);
console.log("page errors:", errs.length ? errs : "none");
await b.close();
mock?.kill();
done();
process.exit();
