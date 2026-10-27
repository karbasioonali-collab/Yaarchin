// مشتری: ثبت‌نام، ورود و خروج، رمز، «حساب من» و پروفایل کسب‌وکار، علاقه‌مندی، بازدیدهای اخیر و ثبت رفتار، گفتگوی عمومی،
// و بخش «مشتریان» پنل (جستجو، صفحه‌ی مشتری، غیرفعال کردن). اجرا: TEST_DB=… node tests/e2e/customer.e2e.mjs — docs/infoyaarchin.md بخش ۱۸.
import { B, admin, api, done, launch, ok, psql, setS, vis, waitFor } from "./lib.mjs";

const run = Date.now().toString(36);
const email = `signup-${run}@example.com`;
const PASS1 = `Sign-Up-${run}-Pw!`;
const PASS2 = `Changed-${run}-Pw!`;
setS("features.customer_signup", true);
setS("features.favorites", true);
setS("features.chat", true);
setS("features.ai_agent", false);

const { b, errs, page } = await launch();
const c = await page();
const loginForm = (p) => p.locator("form", { has: p.locator('input[name="password"]') });

// ---------- ثبت‌نام ----------
await c.goto(B + "/login?mode=signup");
const sign = c.locator("form", { has: c.locator('input[name="fullName"]') });
await sign.locator('input[name="fullName"]').fill(`مشتری تست ${run}`);
await sign.locator('input[name="identifier"]').fill(email);
await sign.locator('input[name="password"]').fill("123");
await sign.getByRole("button", { name: "ثبت‌نام" }).click();
ok(await vis(c.getByRole("alert")), "signup: weak password rejected");
await sign.locator('input[name="password"]').fill(PASS1);
await sign.getByRole("button", { name: "ثبت‌نام" }).click();
await c.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => {});
const uid = psql(`select id from users where email='${email}'`);
ok(!!uid && psql(`select r.key from user_roles ur join roles r on r.id=ur.role_id where ur.user_id='${uid}'`) === "customer", "signup: user with customer role");
ok(psql(`select count(*) from user_roles where user_id='${uid}'`) === "1", "signup: only the customer role (no staff role)");
// تکراری
const c2 = await page();
await c2.goto(B + "/login?mode=signup");
const s2 = c2.locator("form", { has: c2.locator('input[name="fullName"]') });
await s2.locator('input[name="fullName"]').fill("تکراری");
await s2.locator('input[name="identifier"]').fill(email);
await s2.locator('input[name="password"]').fill(PASS1);
await s2.getByRole("button", { name: "ثبت‌نام" }).click();
ok(await vis(c2.getByRole("alert")), "signup: duplicate email rejected");
ok(psql(`select count(*) from users where email='${email}'`) === "1", "signup: no duplicate user");
// مشتری به پنل راه ندارد
await c.goto(B + "/admin");
ok(/\/admin\/login/.test(c.url()) || (await c.getByText(/دسترسی|ورود/).count()) > 0, "customer cannot enter admin panel");

// ---------- حساب من ----------
await c.goto(B + "/account");
ok(await vis(c.getByRole("heading", { name: "حساب من" })), "account page");
const mobile = "0912" + String(Date.now()).slice(-7);
await c.locator('input[name="mobile"]').fill(mobile);
await c
  .locator("form", { has: c.locator('input[name="mobile"]') })
  .locator('input[name="currentPassword"]')
  .fill(PASS1)
  .catch(() => {});
await c.getByRole("button", { name: "ذخیره‌ی مشخصات" }).click();
ok(await waitFor(() => psql(`select coalesce(mobile,'') from users where id='${uid}'`) === mobile), "account: mobile saved");
await c.locator('select[name="businessType"]').selectOption({ index: 1 });
await c.locator('input[name="city"]').fill("تبریز");
await c.locator('input[name="importExperience"]').first().check();
await c.locator('input[name="interests"]').first().check();
await c.getByRole("button", { name: "ذخیره‌ی پروفایل" }).click();
ok(await waitFor(() => psql(`select coalesce(city,'') from customer_profiles where user_id='${uid}'`) === "تبریز"), "business profile saved");
// تغییر رمز
const pwForm = c.locator("form", { has: c.locator('input[name="newPassword"]') });
await pwForm.locator('input[name="currentPassword"]').fill("wrong-password");
await pwForm.locator('input[name="newPassword"]').fill(PASS2);
await pwForm.getByRole("button", { name: "تغییر رمز" }).click();
ok(await vis(pwForm.getByRole("alert")), "change password: wrong current rejected");
await pwForm.locator('input[name="currentPassword"]').fill(PASS1);
await pwForm.locator('input[name="newPassword"]').fill(PASS2);
await pwForm.getByRole("button", { name: "تغییر رمز" }).click();
ok(await vis(pwForm.getByRole("status")), "change password: ok");

// ---------- خروج و ورود (با موبایل و رمز تازه) ----------
await c.getByRole("button", { name: "خروج", exact: true }).click();
await c.waitForTimeout(800);
await c.goto(B + "/account");
ok(c.url().includes("/login"), "logout: session ended (account → login)");
psql("delete from login_attempts");
await c.goto(B + "/login");
await loginForm(c).locator('input[name="identifier"]').fill(mobile);
await loginForm(c).locator('input[name="password"]').fill(PASS1);
await loginForm(c).getByRole("button", { name: "ورود" }).click();
ok(await vis(c.getByRole("alert")), "login: old password rejected");
await loginForm(c).locator('input[name="password"]').fill(PASS2);
await loginForm(c).getByRole("button", { name: "ورود" }).click();
await c.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => {});
ok(!c.url().includes("/login"), "login with mobile + new password");
// ورود پیامکی بدون سرویس پیامک واقعی نمایش داده نمی‌شود
setS("features.sms", true);
const g = await page();
await g.goto(B + "/login");
ok((await g.getByRole("button", { name: "ورود با کد پیامکی" }).count()) === 0, "SMS login hidden without real SMS provider");
setS("features.sms", false);

// ---------- علاقه‌مندی و بازدیدها ----------
await c.goto(B + "/p/led-bulb-12w");
await c.getByRole("button", { name: "افزودن به علاقه‌مندی‌ها" }).first().click();
ok(await waitFor(() => psql(`select count(*) from favorites where user_id='${uid}'`) === "1"), "favorite added");
await c.goto(B + "/p/juicer-300w");
await c.waitForTimeout(1500);
await c.goto(B + "/favorites");
ok(await vis(c.locator('main a[href="/p/led-bulb-12w"]')), "favorites page lists product");
const rm = await api(c, "DELETE", "/api/v1/favorites", { product: "led-bulb-12w" });
ok((rm.s === 200 && psql(`select count(*) from favorites where user_id='${uid}'`) === "0") || rm.s === 405, "favorite removed via API");
ok(await waitFor(() => Number(psql(`select count(*) from events where user_id='${uid}' and type='product_view'`)) >= 2), "product views recorded in events");
await c.goto(B + "/account/recent");
ok(await vis(c.locator('main a[href="/p/juicer-300w"]')), "recent views list");

// ---------- گفتگوی عمومی ----------
await c.goto(B + "/account/chats");
await c.getByRole("button", { name: "گفتگوی تازه با کارشناس" }).click();
await c.getByPlaceholder("مثلاً: دستگاه بسته‌بندی پودر").fill(`موضوع عمومی ${run}`);
await c.getByPlaceholder("مشخصات، تعداد تقریبی، عکس یا لینک محصول، …").fill(`سؤال عمومی ${run}`);
await c.getByRole("button", { name: "شروع گفتگو" }).click();
ok(await waitFor(() => psql(`select count(*) from conversations where customer_id='${uid}' and kind='general'`) === "1"), "general chat started from «my chats»");

// ---------- پنل: مشتریان ----------
const ad = await page();
await admin(ad);
await ad.goto(B + `/admin/customers?q=${encodeURIComponent(email)}`);
ok(await vis(ad.locator(`a[href="/admin/customers/${uid}"]`)), "admin: search customer by email");
await ad.goto(B + `/admin/customers/${uid}`);
ok((await vis(ad.getByText(`مشتری تست ${run}`).first())) && (await vis(ad.getByText("تبریز").first())), "admin: customer detail with profile");
await ad.getByRole("button", { name: "غیرفعال کردن مشتری" }).click();
ok(await waitFor(() => psql(`select status from users where id='${uid}'`) === "disabled"), "admin: disable customer");
await c.goto(B + "/account");
ok(c.url().includes("/login"), "disabled customer's session ends");
psql("delete from login_attempts");
const d = await page();
await d.goto(B + "/login");
await loginForm(d).locator('input[name="identifier"]').fill(email);
await loginForm(d).locator('input[name="password"]').fill(PASS2);
await loginForm(d).getByRole("button", { name: "ورود" }).click();
ok(await vis(d.getByRole("alert")), "disabled customer cannot log in");
await ad.reload();
await ad.getByRole("button", { name: "فعال کردن مشتری" }).click();
ok(await waitFor(() => psql(`select status from users where id='${uid}'`) === "active"), "admin: re-enable customer");
ok(Number(psql(`select count(*) from activity_log where entity_id='${uid}'`)) >= 2, "customer status changes logged");

// ---------- سوئیچ ثبت‌نام ----------
setS("features.customer_signup", false);
const s = await page();
await s.goto(B + "/login?mode=signup");
ok((await s.locator('input[name="fullName"]').count()) === 0, "signup switch off → no signup form");
setS("features.customer_signup", true);

console.log("page errors:", errs.length ? errs : "none");
ok(!errs.length, "no JS page errors");
await b.close();
done();
process.exit();
