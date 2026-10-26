// قبل از migration ۰۰۱۰ (دیتابیس در ۰۰۰۹، مثل لیارا پیش از migrate): چت مثل قبل، هیچ اثری از دستیار، هیچ صفحه‌ای خراب نشود.
// اجرا: TEST_DB=postgres://…/yarchin_pre node tests/e2e/ai-pre.e2e.mjs
import { B, admin, api, customer, done, launch, ok, psql, waitFor } from "./lib.mjs";

ok(psql("select to_regclass('kb_items') is null") === "t", "DB is before 0010");
// مثل لیارا: سوئیچ قدیمی روشن (پیش‌فرض seedهای قبلی) و هیچ‌کس دستی عوضش نکرده
psql("update settings set value='true', updated_by=null where key='features.ai_agent'");
psql("update settings set value='true' where key='features.chat'");
psql("update users set mobile='09121110001' where email='admin@test.local'");
psql("update settings set value='\"00:00\"' where key='sms.work_start'");
psql("update settings set value='\"23:59\"' where key='sms.work_end'");
psql("update settings set value='[0,1,2,3,4,5,6]' where key='sms.work_days'");
const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
for (const [u, txt] of [
  ["/admin/ai", "migration ۰۰۱۰"],
  ["/admin/ai/knowledge", "migration ۰۰۱۰"],
]) {
  const r = await ad.goto(B + u);
  ok(r.status() === 200 && (await ad.getByText(txt).count()) > 0, `${u}: not-ready notice`);
}
for (const u of ["/admin", "/admin/chats", "/admin/settings", "/admin/reports", "/admin/customers"]) ok((await ad.goto(B + u)).status() === 200, `${u} 200`);
ok((await ad.getByText("مدل هوش مصنوعی هر وظیفه").count()) === 0, "settings: per-task AI model group gone");

const c = await (await launch()).page();
await customer(c, "ai-pre@example.com", "AI Pre Customer");
const slug = psql("select slug from products where status='published' order by slug limit 1");
const r = await api(c, "POST", "/api/v1/chat", { product: slug, message: "سلام، قیمت چنده؟" });
ok(r.s === 200 && r.j.messages.length >= 1 && !r.j.assistantTyping, `customer chat works without AI (${r.s})`);
const conv = r.j.conversation.id;
ok(await waitFor(() => psql(`select count(*) from sms_outbox where conversation_id='${conv}' and kind='chat_new'`) !== "0", 8000), "new-chat SMS alert as before");
ok(psql(`select count(*) from chat_messages where conversation_id='${conv}' and sender_type='ai'`) === "0", "no AI message");
await ad.goto(B + `/admin/chats/${conv}`);
ok((await ad.getByRole("heading", { name: "دستیار هوشمند" }).count()) === 0, "chat page: no assistant card");
console.log("page errors:", errs.length ? errs : "none");
await b.close();
done();
process.exit();
