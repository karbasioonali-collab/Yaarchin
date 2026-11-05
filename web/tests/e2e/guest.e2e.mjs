// شمردن بازدید مهمان‌ها (migration ۰۰۱۵). docs/infoyaarchin.md بخش ۴۸.
// مرورگر تست خودش «HeadlessChrome» است و ربات حساب می‌شود؛ مهمان واقعی با user agent عادی ساخته می‌شود.
// اجرا: TEST_DB=postgres://…/yarchin_e2e node tests/e2e/guest.e2e.mjs
import { B, admin, customer, done, launch, ok, psql, setS, sleep, waitFor } from "./lib.mjs";

const run = Date.now().toString(36);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
setS("auth.enforce_permissions", false);
psql("update lead_score_rules set enabled = (kind <> 'signal')");
psql("delete from events where user_id is null and anon_id is not null");
ok(psql("select to_regclass('events_anon_idx') is not null") === "t", "migration 0015: index exists");
const SLUG = psql("select slug from products where status='published' order by slug limit 1");
const SLUG2 = psql("select slug from products where status='published' order by slug offset 1 limit 1");
const CAT = psql("select slug from categories where status='active' order by sort_order, slug limit 1");
const PID = psql(`select id from products where slug='${SLUG}'`);

const { b, errs, page } = await launch();
const guestPage = () => page({ userAgent: UA });
const yidOf = async (p) => (await p.context().cookies()).find((c) => c.name === "yid")?.value ?? null;
const ev = (anon, extra = "") =>
  psql(`select type || ':' || count(*) from events where anon_id='${anon}' ${extra} group by type order by type`).split("\n").filter(Boolean).join(",");
const guestTotal = () => psql("select count(*) from events where anon_id is not null and user_id is null");

// ---------- مهمان: ورود روزانه، بازدید محصول و دسته، تکراری‌ها ----------
const g = await guestPage();
await g.goto(B + "/");
ok(await waitFor(async () => !!(await yidOf(g))), "guest gets a random id cookie (yid)");
const yid = await yidOf(g);
const ck = (await g.context().cookies()).find((c) => c.name === "yid");
ok(ck.httpOnly && ck.sameSite === "Lax" && ck.expires > Date.now() / 1000 + 300 * 86400, "cookie: httpOnly, Lax, ~1 year");
ok(await waitFor(() => ev(yid) === "site_visit:1"), `home → one site_visit (${ev(yid)})`);
await g.goto(B + `/p/${SLUG}`);
await g.goto(B + `/c/${CAT}`);
await g.goto(B + `/p/${SLUG}`);
await g.reload();
await g.goto(B + "/");
await sleep(800);
ok(await waitFor(() => ev(yid) === "category_view:1,product_view:1,site_visit:1"), `same product within 30 min counted once; one visit per day (${ev(yid)})`);
ok(psql(`select count(*) from events where anon_id='${yid}' and (user_agent is not null or user_id is not null)`) === "0", "no user agent or user stored for guests");
// پیش از ۳۰ دقیقه نه، بعد از ۳۰ دقیقه دوباره
psql(`update events set occurred_at = now() - interval '31 minutes' where anon_id='${yid}' and type='product_view'`);
await g.goto(B + `/p/${SLUG}`);
ok(await waitFor(() => ev(yid, "and type='product_view'") === "product_view:2"), "after 30 minutes → counted again");

// ---------- ربات، prefetch، بدون کوکی ----------
{
  const before = guestTotal();
  const bot = await page(); // HeadlessChrome
  await bot.goto(B + `/p/${SLUG2}`);
  await bot.goto(B + "/");
  await sleep(1500);
  ok(guestTotal() === before && !(await yidOf(bot)), "headless/bot user agent → nothing recorded, no cookie");
  // مرورگر هدر Sec-* را از جاوااسکریپت نمی‌فرستد (هدر ممنوع)؛ پس مستقیم با همان کوکی مهمان
  const pre = (h) =>
    fetch(B + "/api/v1/events", { method: "POST", headers: { "content-type": "application/json", "user-agent": UA, cookie: `yid=${yid}`, ...h }, body: JSON.stringify({ path: `/p/${SLUG2}` }) });
  const r = (await pre({ "sec-purpose": "prefetch" })).status;
  await pre({ purpose: "prefetch" });
  await sleep(500);
  ok(r === 204 && ev(yid, "and type='product_view'") === "product_view:2", "prefetch header → not recorded");
  const head = await fetch(B + "/api/v1/events", { method: "HEAD", headers: { "user-agent": UA } });
  ok(head.status !== 204 || guestTotal() === before, `HEAD not tracked (${head.status})`);
  ok((await fetch(B + "/api/v1/health")).ok && guestTotal() === before, "health check not tracked");
}

// ---------- CGNAT: خیلی از مهمان‌ها پشت یک IP ← همه شمرده می‌شوند ----------
{
  const before = Number(guestTotal());
  const N = 80;
  await Promise.all(
    Array.from({ length: N }, () =>
      fetch(B + "/api/v1/events", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": UA, "x-forwarded-for": "5.120.0.1" },
        body: JSON.stringify({ path: "/" }),
      }),
    ),
  );
  ok(await waitFor(() => Number(guestTotal()) - before === N), `${N} different guests behind one IP → all ${N} counted (${Number(guestTotal()) - before})`);
  // یک مهمان پرتکرار: حداکثر ۳۰ درخواست در دقیقه ثبت‌پذیر؛ سقف روزانه‌ی ۲۰۰ رویداد
  const one = await guestPage();
  await one.goto(B + "/");
  await waitFor(async () => !!(await yidOf(one)));
  const y1 = await yidOf(one);
  psql(
    `insert into events (anon_id, type, entity_type, entity_id, occurred_at) select '${y1}', 'product_view', 'product', gen_random_uuid()::text, now() - interval '1 minute' from generate_series(1, 200)`,
  );
  await one.goto(B + `/p/${SLUG2}`);
  await sleep(1200);
  ok(
    psql(`select count(*) from events where anon_id='${y1}' and entity_id='${psql(`select id from products where slug='${SLUG2}'`)}'`) === "0",
    "daily cap (200 events) → not recorded",
  );
  await one.close();
}

// ---------- کارمند: مرورگرش دیگر مهمان شمرده نمی‌شود ----------
{
  const s = await guestPage();
  await s.goto(B + "/");
  await waitFor(async () => !!(await yidOf(s)));
  const ys = await yidOf(s);
  await waitFor(() => ev(ys) === "site_visit:1");
  await admin(s);
  ok(ev(ys) === "" && (await s.context().cookies()).some((c) => c.name === "ynt"), "staff login → earlier guest events of that browser deleted, no-track cookie");
  // خروج: کوکی نشست پاک می‌شود، yid و ynt می‌مانند (مثل مرورگر کارمندی که از پنل خارج شده)
  const keep = (await s.context().cookies()).filter((c) => c.name === "yid" || c.name === "ynt");
  await s.context().clearCookies();
  await s.context().addCookies(keep);
  const before = guestTotal();
  await s.goto(B + "/");
  await s.goto(B + `/p/${SLUG2}`);
  await sleep(1500);
  ok(guestTotal() === before, "same browser after staff login → never counted as guest");
  await s.close();
}

// ---------- وصل شدن به حساب بعد از ورود (۹۰ روز) و اثر روی امتیاز ----------
{
  const m = await guestPage();
  await m.goto(B + "/");
  await waitFor(async () => !!(await yidOf(m)));
  const ym = await yidOf(m);
  await m.goto(B + `/p/${SLUG}`);
  await waitFor(() => ev(ym) === "product_view:1,site_visit:1");
  // دو روز قبل هم آمده بود؛ و یک بازدید ۱۰۰ روز پیش (بیرون از ۹۰ روز ← وصل نمی‌شود)
  psql(`insert into events (anon_id, type, occurred_at) values ('${ym}', 'site_visit', now() - interval '2 days'), ('${ym}', 'site_visit', now() - interval '100 days')`);
  const uid = await customer(m, `guest-${run}@example.com`, "Guest Merge");
  const merged = psql(`select type || ':' || count(*) from events where user_id='${uid}' and type in ('site_visit','product_view') group by type order by type`).replace(
    /\n/g,
    ",",
  );
  ok(merged === "product_view:1,site_visit:2", `guest events (90 days) linked to the account; same-day visit merged (${merged})`);
  ok(psql(`select count(*) from events where anon_id='${ym}' and user_id is null`) === "1", "event older than 90 days stays a guest event");
  await m.goto(B + "/");
  await sleep(800);
  ok(
    psql(
      `select count(*) from events where user_id='${uid}' and type='site_visit' and occurred_at >= date_trunc('day', now() at time zone 'Asia/Tehran') at time zone 'Asia/Tehran'`,
    ) === "1",
    "no duplicate «site visit» today after login",
  );
  const ad = await page();
  await admin(ad);
  await ad.goto(B + `/admin/customers/${uid}`);
  const unitsOf = async (label) => (await ad.locator("tr", { hasText: label }).first().locator("td").nth(1).innerText()).trim();
  ok((await unitsOf("روزهای بازدید از سایت")) === "۲" && (await unitsOf("بازدید محصول متفاوت")) === "۱", "lead score sees the guest days and product");
  await ad.close();
}

// ---------- گزارش‌ها: مهمان و مشتری جدا و جمع؛ پربازدیدها با مهمان ----------
{
  const ad = await page();
  await admin(ad);
  await ad.goto(B + "/admin/reports?range=today");
  const q = (cond) =>
    Number(
      psql(`select count(*) from events where type='product_view' and ${cond} and occurred_at >= date_trunc('day', now() at time zone 'Asia/Tehran') at time zone 'Asia/Tehran'`),
    );
  const all = q("true");
  const gst = q("user_id is null and anon_id is not null");
  const kpi = await ad
    .locator("div", { has: ad.locator("span", { hasText: /^بازدید محصول$/ }) })
    .last()
    .innerText();
  ok(
    kpi.includes(all.toLocaleString("fa-IR")) && kpi.includes(`مشتری ${(all - gst).toLocaleString("fa-IR")} · مهمان ${gst.toLocaleString("fa-IR")}`),
    `product views: total + split (${kpi.replace(/\n/g, " ")})`,
  );
  ok((await ad.getByTestId("kpi-split").count()) === 3, "three KPIs with guest/customer split");
  const vis = await ad
    .locator("div", { has: ad.locator("span", { hasText: /^بازدیدکننده‌ی یکتا$/ }) })
    .last()
    .innerText();
  ok(/مهمان [۰-۹٬]+/.test(vis) && !vis.includes("مهمان ۰"), `unique visitors include guests (${vis.replace(/\n/g, " ")})`);
  // محصولی که فقط مهمان دیده
  const top = await ad.locator("section", { hasText: "پربازدیدترین محصولات" }).innerText();
  ok(top.includes(psql(`select title_fa from products where slug='${SLUG}'`)), "top products include guest views");
  // customer_signal (حتی با anon_id) در هیچ عددی نیست
  const before = await ad.locator("main").innerText();
  psql(`insert into events (anon_id, type, entity_type, entity_id) select '${yid}', 'customer_signal', 'conversation', gen_random_uuid()::text from generate_series(1, 5)`);
  await ad.reload();
  ok((await ad.locator("main").innerText()) === before, "customer_signal events not counted");
  psql(`delete from events where anon_id='${yid}' and type='customer_signal'`);
  await ad.close();
}

// ---------- پاک‌سازی: مهمانِ وصل‌نشده بعد از ۱۸۰ روز؛ مشتری هرگز ----------
{
  const cid = psql("select u.id from users u join user_roles ur on ur.user_id=u.id join roles r on r.id=ur.role_id where r.key='customer' limit 1");
  psql(
    `insert into events (anon_id, type, occurred_at, props) values ('cleanup${run}aaaaaaaaaa', 'site_visit', now() - interval '200 days', '{"t":"old-guest"}'), ('cleanup${run}aaaaaaaaaa', 'site_visit', now() - interval '170 days', '{"t":"recent-guest"}')`,
  );
  psql(`insert into events (user_id, type, occurred_at, props) values ('${cid}', 'site_visit', now() - interval '200 days', '{"t":"old-customer"}')`);
  ok(await waitFor(() => psql(`select count(*) from events where props->>'t'='old-guest'`) === "0", 80000), "guest event older than 180 days deleted by the scheduler");
  ok(
    psql(`select string_agg(props->>'t', ',' order by props->>'t') from events where props->>'t' in ('recent-guest','old-customer')`) === "old-customer,recent-guest",
    "170-day guest event and old customer event kept",
  );
  psql(`delete from events where props->>'t' in ('recent-guest','old-customer')`);
}

// ---------- ثبت شکست بخورد ← صفحه عادی ----------
{
  const f = await guestPage();
  await f.route("**/api/v1/events", (r) => r.fulfill({ status: 500, body: "x" }));
  const res = await f.goto(B + `/p/${SLUG}`);
  ok(res.status() === 200 && (await f.locator("h1").count()) > 0, "tracking fails (500) → page still opens");
  await f.close();
  // بدنه‌ی خراب یا مسیر نامعتبر ← ۲۰۴ بدون ثبت
  const bad = await fetch(B + "/api/v1/events", { method: "POST", headers: { "content-type": "application/json", "user-agent": UA }, body: "{not json" });
  ok(bad.status === 204, "broken body → 204");
}

// مشتری واردشده مثل قبل (بدون anon_id)
{
  const c = await page({ userAgent: UA });
  const uid = await customer(c, `guest-cust-${run}@example.com`, "Cust");
  await c.goto(B + `/p/${SLUG2}`);
  ok(await waitFor(() => psql(`select count(*) from events where user_id='${uid}' and type='product_view' and anon_id is null`) === "1"), "logged-in customer tracked as before");
}

await sleep(100);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
