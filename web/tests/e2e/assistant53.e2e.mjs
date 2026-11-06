// بخش ۵۳: سه باگ نشانه‌ها (آزمون واقعی ۲۰۲۶-۱۱-۰۶) و بهبودهای دستیار. بدون migration؛ seed: سه سؤال آزمون.
//   AI_E2E=live ← سرور با دستیار زنده (mock-ai.mjs؛ این تست خودش بالا می‌آورد): نشانه‌ها، جواب زمان حمل با کد، عدد بی‌واحد، کارت نرخ
//   AI_E2E=test ← سرور عادی (مدل ساختگی، حالت آزمایشی): فقط [[bare]] در مدل ساختگی
// اجرا: TEST_DB=postgres://…/yarchin_e2e AI_E2E=live node tests/e2e/assistant53.e2e.mjs
import { spawn } from "node:child_process";
import { B, admin, api, customer, done, launch, ok, psql, setS, sleep, waitFor } from "./lib.mjs";

const LIVE = process.env.AI_E2E !== "test";
const run = Date.now().toString(36);
psql("update settings set value='true' where key='features.chat'");
setS("auth.enforce_permissions", false);
setS("ai.block_invented_numbers", false);
for (const [k, v] of Object.entries({
  max_replies_per_chat: 12,
  customer_daily_messages: 40,
  daily_requests: 1500,
  daily_cost_toman: 50000,
  big_order_qty: 5000,
  lead_score_handoff: 80,
}))
  setS(`ai.${k}`, v);
const SLUG = "portable-blender";

if (LIVE) {
  const mock = spawn(process.execPath, [new URL("./mock-ai.mjs", import.meta.url).pathname, "3399"], { stdio: ["ignore", "ignore", "inherit"] });
  process.on("exit", () => mock.kill());
  await sleep(500);
}

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
let nCust = 0;
const newCustomer = async () => {
  const p = await page();
  const id = await customer(p, `a53-${run}-${++nCust}@example.com`, `A53 Customer ${nCust}`);
  return { p, id };
};
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
  return { conv, mid };
};
const sig = (u) =>
  psql(
    `select string_agg(key || '=' || coalesce(value_num::float::text, '-') || '/' || source || coalesce('/' || value_text, ''), ',' order by key) from customer_signals where user_id='${u}'`,
  );
const reqOf = (mid) => psql(`select outcome || '|' || coalesce(meta->>'suspectNumbers', '') from ai_requests where message_id=${mid} order by id desc limit 1`);
const lastAi = (conv) => psql(`select body from chat_messages where conversation_id='${conv}' and sender_type='ai' order by id desc limit 1`);
const MSG1 = "۵۰۰ تا چند میشه؟";
const MSG2 = "حدود ۱ میلیارد سرمایه دارم و فروشگاه اینترنتی دارم";

if (!LIVE) {
  // ---------- مدل ساختگی: [[bare]] ----------
  setS("features.ai_agent", true);
  const c = await newCustomer();
  const { conv, mid } = await say(c.p, SLUG, "قیمت با حمل [[bare]] برای حداقل سفارش؟", { isNew: true });
  ok(reqOf(mid).includes("397"), `fake model [[bare]] → «۳۹۷» logged as out-of-data (${reqOf(mid)})`);
  ok(lastAi(conv).includes("زمینی: ۳۹۷"), "test mode: answer kept (switch off), number only logged");
  setS("features.ai_agent", false);
} else {
  // ---------- چت انسانی (دستیار خاموش): هر سه نشانه با کد ----------
  setS("features.ai_agent", false);
  const h = await newCustomer();
  const { conv: hc } = await say(h.p, SLUG, MSG1, { isNew: true, wait: false });
  await say(h.p, hc, MSG2, { wait: false });
  await sleep(800);
  ok(
    sig(h.id) === "budget_mtoman=1000/chat_code/۱ میلیارد تومان,order_qty=500/chat_code/۵۰۰,sales_channel=1/chat_code/فروش اینترنتی",
    `human chat: qty, budget, online by code (${sig(h.id)})`,
  );

  // ---------- دستیار روشن: همان دو پیام آزمون واقعی ----------
  setS("features.ai_agent", true);
  const c = await newCustomer();
  const m1 = await say(c.p, SLUG, MSG1, { isNew: true });
  ok(reqOf(m1.mid).startsWith("site_qty_price"), `«${MSG1}» → qty price answer by code (${reqOf(m1.mid)})`);
  ok(sig(c.id) === "order_qty=500/chat_code/۵۰۰", `order_qty=500 recorded (${sig(c.id)})`);
  const m2 = await say(c.p, m1.conv, MSG2);
  ok(reqOf(m2.mid).startsWith("other"), "model hand-off for a serious budget kept (intentional)");
  ok(
    sig(c.id) === "budget_mtoman=1000/chat_code/۱ میلیارد تومان,order_qty=500/chat_code/۵۰۰,sales_channel=1/chat_code/فروش اینترنتی",
    `budget 1,000 million and online (model said shop) (${sig(c.id)})`,
  );
  ok(psql(`select count(*) from customer_signals where user_id='${c.id}' and value_text like '%مغازه%'`) === "0", "no «مغازه» channel");
  await ad.goto(B + `/admin/customers/${c.id}`);
  const card = await ad.locator("main").innerText();
  ok(card.includes("نشانه‌ها از گفتگو") && card.includes("فروش اینترنتی") && card.includes("۵۰۰"), "customer page signals card shows 500 and online");
  // مدل فقط با واحد فارسی (بدون کلمه‌ی بودجه در متن): «budget=1 میلیارد toman» حالا خوانده می‌شود
  const c2 = await newCustomer();
  await say(c2.p, SLUG, "۱ میلیارد دارم [[sigFa]]", { isNew: true });
  ok(sig(c2.id).startsWith("budget_mtoman=1000/ai/"), `model line with Persian scale accepted (${sig(c2.id)})`);

  // ---------- جواب زمان حمل با کد ----------
  const c3 = await newCustomer();
  const t3 = await say(c3.p, SLUG, "چقدر طول می‌کشه برسه؟", { isNew: true });
  ok(reqOf(t3.mid).startsWith("site_time"), `delivery time → code answer (${reqOf(t3.mid)})`);
  const tb = lastAi(t3.conv);
  ok(tb.startsWith("زمان تقریبی رسیدن") && /روز/.test(tb) && !tb.includes("بستگی دارد"), `days per shipping method from product data (${tb.slice(0, 120)})`);
  ok(psql(`select meta->>'source' from chat_messages where conversation_id='${t3.conv}' and sender_type='ai' order by id desc limit 1`) === "product", "source: product");

  // ---------- عدد بی‌واحد (mock) ----------
  const c4 = await newCustomer();
  const b4 = await say(c4.p, SLUG, "قیمت با حمل [[bare]]", { isNew: true });
  ok(reqOf(b4.mid).includes("397"), `«زمینی: ۳۹۷» flagged as out-of-data (${reqOf(b4.mid)})`);
  setS("ai.block_invented_numbers", true);
  const b5 = await say(c4.p, b4.conv, "قیمت با حمل [[bare]] دوباره");
  ok(reqOf(b5.mid).startsWith("invented_number"), "with the switch on → hand-off «عدد خارج از داده»");
  setS("ai.block_invented_numbers", false);
  setS("features.ai_agent", false);

  // ---------- کارت نرخ داشبورد: آخرین نرخ ثبت‌شده به‌جای «—» ----------
  const today = psql("select (now() at time zone 'Asia/Tehran')::date");
  const saved = psql(`select coalesce(string_agg(id::text, ','), '') from exchange_rates where currency_code='CNY' and kind='market' and rate_date >= '${today}'::date - 1`);
  if (saved) psql(`update exchange_rates set rate_date = rate_date - 30 where id in (${saved})`);
  psql(`insert into exchange_rates (currency_code, kind, rate_toman, rate_date, note) values ('CNY', 'market', 13579, '${today}'::date - 5, 'a53-${run}')`);
  await ad.goto(B + "/admin");
  const cny = await ad.getByTestId("rate-CNY").innerText();
  ok(cny.includes("آخرین نرخ") && cny.includes("۱۳٬۵۷۹ تومان") && !cny.includes("—") && cny.includes("امروز ثبت نشده"), `no rate today → last rate with date (${cny})`);
  psql(`delete from exchange_rates where note='a53-${run}'`);
  if (saved) psql(`update exchange_rates set rate_date = rate_date + 30 where id in (${saved})`);
}

await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
