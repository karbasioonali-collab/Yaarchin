// بخش ۵۴: زمان رسیدن با دو بخش (آماده‌سازی کارخانه + حمل) در کارت ماشین‌حساب، جواب‌های کد دستیار و برچسب پنل. بدون migration.
// سرور با دستیار زنده (MOCK_ENV در run-all؛ جواب‌های کد بدون مدل‌اند ولی فقط با دستیار زنده به مشتری نشان داده می‌شوند).
// اجرا: TEST_DB=postgres://…/yarchin_e2e node tests/e2e/arrival.e2e.mjs
import { B, admin, api, customer, done, launch, ok, psql, setS, sleep, waitFor } from "./lib.mjs";

const run = Date.now().toString(36);
const fa = (n) => Number(n).toLocaleString("fa-IR");
const span = (r) => (r.min === r.max ? fa(r.min) : `${fa(r.min)} تا ${fa(r.max)}`);
// همان قاعده‌ی src/lib/pricing/arrival-text.ts
const expectText = (lead, t) =>
  !t
    ? "زمان: استعلام"
    : lead === null
      ? `${span(t)} روز حمل`
      : `حدود ${span({ min: lead + t.min, max: lead + t.max })} روز (${fa(lead)} روز آماده‌سازی کارخانه + ${span(t)} روز حمل)`;
psql("update settings set value='true' where key='features.chat'");
setS("auth.enforce_permissions", false);
for (const [k, v] of Object.entries({
  max_replies_per_chat: 12,
  customer_daily_messages: 40,
  daily_requests: 1500,
  daily_cost_toman: 50000,
  big_order_qty: 5000,
  lead_score_handoff: 80,
}))
  setS(`ai.${k}`, v);

const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
const landed = async (slug, qty) => (await (await fetch(`${B}/api/v1/products/${slug}/landed?qty=${qty}`)).json()).landed ?? null;

// ---------- کارت ماشین‌حساب صفحه‌ی محصول ----------
const SLUG = "portable-blender";
const p = await page();
await p.goto(B + `/p/${SLUG}`);
const days = await p.getByTestId("method-days").allInnerTexts();
const L0 = await landed(SLUG, Number(await p.locator('input[aria-describedby="landed-note"]').inputValue()) || 0);
ok(days.length >= 2 && days.every((d) => d.includes("آماده‌سازی کارخانه") && d.includes("روز حمل")), `card: preparation + shipping on every method (${days.join(" | ")})`);
if (L0?.methods) {
  const want = L0.methods.map((m) => expectText(L0.leadDays, m.transit));
  ok(JSON.stringify(days.map((d) => d.trim())) === JSON.stringify(want), `card text = API (lead ${L0.leadDays}, ${want[0]})`);
  ok(
    L0.methods.every((m) => !m.transit || !m.days || m.days.min === L0.leadDays + m.transit.min),
    "API: total = preparation + shipping",
  );
}
ok((await p.getByTestId("lead-missing").count()) === 0, "no «not recorded» note when preparation is known");
ok((await p.locator("#landed-note").innerText()).includes("زمان رسیدن = آماده‌سازی در کارخانه + حمل"), "card footnote");

// بدون زمان آماده‌سازی (عدد قدیمی و سابقه‌ی پله‌ها خالی): زمان حمل می‌ماند + یادداشت
const NOLEAD = "kraft-paper-bag";
const savedLead = psql(
  `select coalesce(string_agg(l.id || ':' || l.lead_time_days, ','), '') from product_listings l join products p on p.id=l.product_id where p.slug='${NOLEAD}' and l.lead_time_days is not null`,
);
ok(
  psql(`select count(*) from lead_time_observations o join product_listings l on l.id=o.listing_id join products p on p.id=l.product_id where p.slug='${NOLEAD}'`) === "0",
  "fixture: no lead tiers",
);
psql(`update product_listings set lead_time_days=null where product_id=(select id from products where slug='${NOLEAD}')`);
await p.goto(B + `/p/${NOLEAD}`);
const d2 = await p.getByTestId("method-days").allInnerTexts();
ok(
  d2.length >= 1 && d2.every((d) => /روز حمل$/.test(d.trim()) || d.trim() === "زمان: استعلام") && d2.some((d) => /روز حمل$/.test(d.trim())),
  `no preparation → shipping days only (${d2.join(" | ")})`,
);
ok(await p.getByTestId("lead-missing").isVisible(), "note «زمان آماده‌سازی کارخانه ثبت نشده…»");
const L2 = await landed(NOLEAD, 100);
ok(L2.leadDays === null && L2.methods.some((m) => m.transit && m.days === null), "API: leadDays null, transit kept, total null");

// ---------- جواب‌های کد دستیار ----------
setS("features.ai_agent", true);
let nCust = 0;
const say = async (slug, text) => {
  const c = await page();
  await customer(c, `arr-${run}-${++nCust}@example.com`, `Arrival ${nCust}`);
  const r = await api(c, "POST", "/api/v1/chat", { product: slug, message: text });
  const conv = r.j.conversation.id;
  const mid = r.j.messages.filter((m) => m.from === "me").at(-1).id;
  await waitFor(() => psql(`select count(*) from ai_requests where message_id=${mid}`) !== "0", 20000);
  await sleep(300);
  return {
    body: psql(`select body from chat_messages where conversation_id='${conv}' and sender_type='ai' order by id desc limit 1`),
    outcome: psql(`select outcome from ai_requests where message_id=${mid}`),
  };
};
const t1 = await say(SLUG, "چقدر طول می‌کشه برسه؟");
ok(t1.outcome === "site_time" && /آماده‌سازی کارخانه \+ .* روز حمل\)/.test(t1.body), `time reply: two parts (${t1.body.split("\n")[1]})`);
const t2 = await say(SLUG, "۵۰۰ تا چند میشه؟");
ok(t2.outcome === "site_qty_price" && t2.body.includes("روز آماده‌سازی کارخانه +"), `qty price reply: two parts (${t2.body.split("\n")[1]})`);
const t3 = await say(SLUG, "قیمتش چنده؟");
ok(t3.outcome === "site_price" && t3.body.includes("روز آماده‌سازی کارخانه +"), "price reply: two parts");
const t4 = await say(NOLEAD, "کی می‌رسه؟");
ok(t4.outcome === "site_time" && t4.body.includes("روز حمل") && t4.body.includes("زمان آماده‌سازی کارخانه ثبت نشده"), `time reply without preparation (${t4.body})`);
setS("features.ai_agent", false);
for (const x of savedLead.split(",").filter(Boolean)) {
  const [id, d] = x.split(":");
  psql(`update product_listings set lead_time_days=${d} where id='${id}'`);
}

// ---------- پنل: برچسب صفحه‌ی هزینه‌ی حمل و ماشین‌حساب ----------
await ad.goto(B + "/admin/rates/shipping");
ok((await ad.getByText("زمان حمل (بدون آماده‌سازی کارخانه): حداقل روز").count()) >= 1, "shipping page label");
const pid = psql(`select id from products where slug='${SLUG}'`);
await ad.goto(B + `/admin/rates/calculator?product=${pid}`);
ok(/زمان رسیدن: حدود .* روز \(.* روز آماده‌سازی کارخانه \+ .* روز حمل\)/.test(await ad.locator("main").innerText()), "panel calculator: two parts");

await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
