// قبل از migration ۰۰۱۱ (دیتابیس در ۰۰۱۰، مثل لیارا پیش از migrate): دستیار مثل قبل کار کند، صفحه‌های آزمون و پیشنهاد فقط پیام
// «بعد از migration» نشان دهند، هیچ صفحه‌ای خراب نشود و هیچ چیزی در جدول‌های تازه نوشته نشود. docs/infoyaarchin.md بخش ۳۳.
// اجرا: TEST_DB=postgres://…/yarchin_e2e_pre node tests/e2e/ai-tests-pre.e2e.mjs
import { B, admin, api, customer, done, launch, ok, psql, setS, waitFor } from "./lib.mjs";

ok(psql("select to_regclass('kb_items') is not null and to_regclass('ai_test_cases') is null") === "t", "DB is at 0010 (before 0011)");
psql("update settings set value='true' where key='features.chat'");
setS("features.ai_agent", true);
setS("auth.enforce_permissions", false);
const { b, errs, page } = await launch();
const ad = await page();
await admin(ad);
for (const u of ["/admin/ai/tests", "/admin/ai/suggestions", "/admin/ai/tests/confirm?scope=all"]) {
  const r = await ad.goto(B + u);
  ok(r.status() === 200 && (await ad.getByText("migration ۰۰۱۱").count()) > 0, `${u}: not-ready notice`);
}
ok((await ad.goto(B + "/admin/ai/tests/00000000-0000-0000-0000-000000000000")).status() === 404, "case page before migrate: 404");
for (const u of ["/admin", "/admin/ai", "/admin/ai/knowledge", "/admin/chats", "/admin/settings"]) ok((await ad.goto(B + u)).status() === 200, `${u} 200`);
ok((await ad.locator("nav").getByText("آزمون دستیار").count()) === 1, "nav item present (page explains migrate)");
ok((await ad.getByText("آزمون کامل دستیار").count()) === 0, "no test banner before migrate");

// سقف‌ها: تنظیم آزمون هنوز seed نشده ← بقیه ذخیره می‌شوند و پیام seed
psql("delete from settings where key='ai.test_daily_cost_toman'");
await ad.goto(B + "/admin/ai");
await ad.fill('input[name="maxReplies"]', "11");
await ad
  .locator("form", { has: ad.locator('input[name="maxReplies"]') })
  .getByRole("button", { name: "ذخیره" })
  .click();
ok(
  await waitFor(() =>
    ad
      .getByText(/npm run db:seed/)
      .count()
      .then((n) => n > 0),
  ),
  "unseeded test cap → seed notice",
);
ok(psql("select value from settings where key='ai.max_replies_per_chat'") === "11", "other limits still saved");
setS("ai.max_replies_per_chat", 12);

// دستیار (حالت آزمایشی) و «جواب اشتباه» بدون جدول پیشنهادها
const c = await page();
await customer(c, "ai-tests-pre@example.com", "AI Tests Pre");
const slug = psql("select slug from products where status='published' order by slug limit 1");
const r = await api(c, "POST", "/api/v1/chat", { product: slug, message: "لپ تاپ گیمینگ دارید؟" });
ok(r.s === 200, `customer chat works (${r.s})`);
const conv = r.j.conversation.id;
ok(await waitFor(() => psql(`select count(*) from chat_messages where conversation_id='${conv}' and sender_type='ai'`) !== "0", 15000), "assistant (test mode) still runs");
await ad.goto(B + `/admin/chats/${conv}`);
const wrong = ad.getByRole("button", { name: "جواب اشتباه" });
if (await wrong.count()) {
  await wrong.first().click();
  ok(await waitFor(() => psql(`select count(*) from ai_feedback where source='staff'`) !== "0"), "staff «جواب اشتباه» works before 0011");
} else ok(true, "no AI reply to mark (handoff)");

// پایگاه دانش: مبلغ ممنوع (فقط کد، بدون جدول تازه)
await ad.goto(B + "/admin/ai/knowledge");
await ad.locator("summary", { hasText: "+ مورد تازه" }).click();
await ad.fill('input[name="question"]', "هزینه‌ی حمل؟");
await ad.fill('textarea[name="answer"]', "حدود ۲ میلیون تومان.");
await ad.getByRole("button", { name: "ذخیره" }).click();
ok(
  await waitFor(() =>
    ad
      .getByText(/قیمت از داده‌های سایت می‌آید/)
      .count()
      .then((n) => n > 0),
  ),
  "KB currency check works before 0011",
);

setS("features.ai_agent", false);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
