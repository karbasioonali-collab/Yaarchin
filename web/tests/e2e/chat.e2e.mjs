// چت مشتری با کارشناس (بدون دستیار): شروع از صفحه‌ی محصول، پیام خودکار، «گفتگوهای من»، صف ارجاع‌نشده، ارجاع، پاسخ کارشناس،
// دسترسی کارشناس، بستن و بازشدن، جداسازی مشتری‌ها، سوئیچ چت، pulse. سوئیچ دستیار خاموش می‌ماند.
// اجرا: TEST_DB=… node tests/e2e/chat.e2e.mjs — docs/infoyaarchin.md بخش ۲۴.
import { B, admin, api, customer, done, expert, launch, ok, psql, setS, vis, waitFor } from "./lib.mjs";

const run = Date.now().toString(36);
setS("features.chat", true);
setS("features.ai_agent", false);
setS("chat.auto_reply", `پیام خودکار تست ${run}`);
const SLUG = "cast-iron-pan-28";

const { b, errs, page } = await launch();
const c = await page();
const custName = `Chat Customer ${run}`;
await customer(c, `chat-${run}@example.com`, custName);

// ---------- شروع گفتگو از صفحه‌ی محصول ----------
await c.goto(B + `/p/${SLUG}`);
const box = c.locator("textarea").first();
await box.fill(`سلام، این محصول رنگ دیگری هم دارد؟ ${run}`);
await box.press("Enter");
ok(await vis(c.getByText(`سلام، این محصول رنگ دیگری هم دارد؟ ${run}`)), "customer: message shows in thread");
ok(await vis(c.getByText(`پیام خودکار تست ${run}`)), "customer: auto reply shown");
const conv = psql(`select c.id from conversations c join users u on u.id=c.customer_id where u.email='chat-${run}@example.com'`);
ok(/^[0-9a-f-]{36}$/.test(conv), "conversation created");
ok(
  psql(`select kind || '|' || status || '|' || coalesce(assigned_to::text,'') from conversations where id='${conv}'`) === "product|open|",
  "conversation: product, open, unassigned",
);
await c.goto(B + "/account/chats");
ok(await vis(c.locator(`a[href="/account/chats/${conv}"]`)), "«my chats» lists the conversation");

// ---------- پنل: صف ارجاع‌نشده، جستجو، ارجاع ----------
const ad = await page();
await admin(ad);
await ad.goto(B + "/admin/chats?tab=unassigned");
ok(await vis(ad.locator(`a[href="/admin/chats/${conv}"]`)), "admin: in unassigned queue");
await ad.goto(B + `/admin/chats?tab=all&q=${encodeURIComponent(custName)}`);
ok((await ad.locator(`a[href="/admin/chats/${conv}"]`).count()) === 1, "admin: search by customer name");
await ad.goto(B + `/admin/chats/${conv}`);
ok(await vis(ad.getByText(`سلام، این محصول رنگ دیگری هم دارد؟ ${run}`)), "admin: sees customer message");
await ad.getByRole("button", { name: "ارجاع به خودم" }).click();
ok(await waitFor(() => psql(`select assigned_to = (select id from users where email='admin@test.local') from conversations where id='${conv}'`) === "t"), "assign to me");
ok(psql(`select count(*) from chat_messages where conversation_id='${conv}' and meta->>'event'='assign'`) === "1", "assign event recorded");

// ---------- پاسخ کارشناس ← مشتری بدون رفرش ----------
await c.goto(B + `/account/chats/${conv}`);
await ad.reload();
await ad.getByLabel("پاسخ").fill(`بله، سه رنگ دارد. ${run}`);
await ad.getByLabel("پاسخ").press("Enter");
ok(await waitFor(() => psql(`select count(*) from chat_messages where conversation_id='${conv}' and sender_type='staff'`) === "1"), "staff reply saved");
ok(await vis(c.getByText(`بله، سه رنگ دارد. ${run}`), 15000), "customer sees staff reply via polling (no refresh)");
ok(await vis(c.getByText("کارشناس یارچین").first()), "customer sees sender as «کارشناس یارچین»");
const mine = await api(c, "GET", `/api/v1/chat/${conv}`);
ok(mine.s === 200 && mine.j.messages.some((m) => m.from === "staff"), "customer API returns staff reply");
ok(!JSON.stringify(mine.j).includes("admin@test.local"), "customer API does not leak staff email");

// ---------- جداسازی مشتری‌ها ----------
const c2 = await page();
await customer(c2, `chat2-${run}@example.com`, "Other Customer");
const other = await api(c2, "GET", `/api/v1/chat/${conv}`);
ok(other.s === 404 || other.s === 403, `other customer cannot read conversation (${other.s})`);
const post = await api(c2, "POST", `/api/v1/chat/${conv}`, { message: "hack" });
ok(post.s === 404 || post.s === 403, "other customer cannot post to conversation");
const anon = await fetch(B + `/api/v1/chat/${conv}`);
ok(anon.status === 401, "guest API → 401");
const empty = await api(c, "POST", `/api/v1/chat/${conv}`, { message: "   " });
ok(empty.s === 400, "empty message rejected");
const long = await api(c, "POST", `/api/v1/chat/${conv}`, { message: "x".repeat(2100) });
ok(long.s === 400 || (long.s === 200 && psql(`select max(length(body)) from chat_messages where conversation_id='${conv}'`) <= "2000"), "message length capped at 2000");

// ---------- کارشناس: فقط گفتگوهای ارجاع‌شده به خودش (با اجرای دسترسی‌ها) ----------
// نقش کارشناس به‌طور پیش‌فرض فقط dashboard.view دارد؛ برای این تست chats.reply می‌گیرد و آخر کار پس گرفته می‌شود
const hadReply = psql("select count(*) from role_permissions rp join roles r on r.id=rp.role_id where r.key='expert' and rp.permission_key='chats.reply'") !== "0";
if (!hadReply) psql("insert into role_permissions (role_id, permission_key) select id, 'chats.reply' from roles where key='expert'");
setS("auth.enforce_permissions", true);
const ex = await page();
await expert(ex);
await ex.goto(B + "/admin/chats");
ok((await ex.locator(`a[href="/admin/chats/${conv}"]`).count()) === 0, "expert: does not see others' chat");
const r = await ex.goto(B + `/admin/chats/${conv}`);
ok(r.status() === 404 || r.status() === 403 || /forbidden/.test(ex.url()) || (await ex.getByLabel("پاسخ").count()) === 0, "expert: cannot open/reply unassigned-to-him chat");
// ادمین ارجاع می‌دهد به کارشناس
await ad.goto(B + `/admin/chats/${conv}`);
const assignForm = ad.locator("form", { has: ad.locator('select[name="to"]') });
await assignForm.locator('select[name="to"]').selectOption({ label: "Test Expert" });
await assignForm.getByRole("button", { name: "ارجاع", exact: true }).click();
ok(
  await waitFor(() => psql(`select assigned_to = (select id from users where email='expert@test.local') from conversations where id='${conv}'`) === "t"),
  "admin assigns to expert",
);
await ex.goto(B + "/admin/chats?tab=mine");
ok(await vis(ex.locator(`a[href="/admin/chats/${conv}"]`)), "expert: sees assigned chat in «my chats»");
await ex.goto(B + `/admin/chats/${conv}`);
await ex.getByLabel("پاسخ").fill(`پاسخ کارشناس ${run}`);
await ex.getByLabel("پاسخ").press("Enter");
ok(await waitFor(() => psql(`select count(*) from chat_messages where conversation_id='${conv}' and sender_type='staff' and body like 'پاسخ کارشناس%'`) === "1"), "expert replies");
setS("auth.enforce_permissions", false);
if (!hadReply) psql("delete from role_permissions where permission_key='chats.reply' and role_id=(select id from roles where key='expert')");

// ---------- خوانده‌نشده‌ها ----------
await api(c, "POST", `/api/v1/chat/${conv}`, { message: `پیام تازه برای شمارش ${run}` });
await ad.goto(B + "/admin/chats?tab=all");
ok(await vis(ad.locator("tr", { has: ad.locator(`a[href="/admin/chats/${conv}"]`) }).getByLabel(/پیام خوانده‌نشده/)), "admin list: unread badge");

// ---------- بستن و بازشدن ----------
await ad.goto(B + `/admin/chats/${conv}`);
await ad.getByRole("button", { name: "بستن گفتگو" }).click();
ok(await waitFor(() => psql(`select status from conversations where id='${conv}'`) === "closed"), "close conversation");
await c.goto(B + `/account/chats/${conv}`);
ok(await vis(c.getByText(/این گفتگو بسته شده/)), "customer sees closed notice");
const re = await api(c, "POST", `/api/v1/chat/${conv}`, { message: `دوباره سلام ${run}` });
ok(re.s === 200 && psql(`select status from conversations where id='${conv}'`) === "open", "customer message reopens closed chat");

// ---------- pulse و سوئیچ ----------
const pulse = await ad.evaluate(async () => (await fetch("/admin/pulse")).status);
ok(pulse === 200, "admin pulse 200");
const pa = await fetch(B + "/admin/pulse", { redirect: "manual" });
ok(pa.status === 401 || (pa.status >= 300 && pa.status < 400 && /\/admin\/login/.test(pa.headers.get("location") ?? "")), "pulse requires staff login");
setS("features.chat", false);
const off = await api(c, "POST", "/api/v1/chat", { product: SLUG, message: "سلام" });
ok(off.s === 503, "chat switch off → API 503");
await c.goto(B + `/p/${SLUG}`);
ok((await c.locator("textarea").count()) === 0, "chat switch off → no chat box on product page");
setS("features.chat", true);

console.log("page errors:", errs.length ? errs : "none");
ok(!errs.length, "no JS page errors");
await b.close();
done();
process.exit();
