// دسترسی پنل: ورود کارکنان و قفل تلاش‌های ناموفق، قانون رمز، کاربرها، قفل‌های «فقط ادمین» (حتی با سوئیچ اجرای دسترسی‌ها خاموش و حتی
// با دور زدن دکمه‌ی قفل در مرورگر)، سوئیچ auth.enforce_permissions، صفحه‌ی forbidden، «بازگشت» امن ورود، لاگ فعالیت.
// کاربرهای تستی (guard-*@example.com) هر بار از نو ساخته می‌شوند. اجرا: TEST_DB=… node tests/e2e/guard.e2e.mjs — docs/infoyaarchin.md بخش ۱۳ و ۱۷.
import { B, PW, admin, done, expert, launch, ok, psql, setS, vis, waitFor } from "./lib.mjs";

const run = Date.now().toString(36);
setS("auth.enforce_permissions", false);
psql("delete from login_attempts");
const { b, errs, page } = await launch();
const staffForm = (p) => p.locator("form", { has: p.locator('input[name="password"]') });
const tryLogin = async (p, id, pw) => {
  await p.goto(B + "/admin/login");
  await staffForm(p).locator('input[name="identifier"]').fill(id);
  await staffForm(p).locator('input[name="password"]').fill(pw);
  await staffForm(p).getByRole("button", { name: "ورود" }).click();
  await p.waitForTimeout(1200);
};

// ---------- ورود ----------
const g = await page();
await tryLogin(g, "admin@test.local", "wrong-password-1");
ok(await vis(g.getByRole("alert")), "staff login: wrong password error");
ok(g.url().includes("/admin/login"), "staff login: stays on login page");
await tryLogin(g, "ai-customer-none@example.com", "whatever");
ok(await vis(g.getByRole("alert")), "unknown user: same generic error");
// قفل بعد از ۵ تلاش ناموفق برای یک شناسه (حتی با رمز درست)
psql("delete from login_attempts");
for (let i = 0; i < 5; i++) await tryLogin(g, "expert@test.local", `wrong-${i}`);
await tryLogin(g, "expert@test.local", PW.expert);
ok(g.url().includes("/admin/login") && (await vis(g.getByRole("alert"))), "lockout after 5 failed attempts");
psql("delete from login_attempts");
// مشتری وارد پنل نمی‌شود
const custEmail = `guard-cust-${run}@example.com`;
psql(`insert into users (full_name, email, password_hash) select 'Guard Customer', '${custEmail}', password_hash from users where email='admin@test.local'`);
psql(`insert into user_roles (user_id, role_id) select u.id, r.id from users u, roles r where u.email='${custEmail}' and r.key='customer'`);
await tryLogin(g, custEmail, PW.admin);
ok(g.url().includes("/admin/login"), "customer cannot log into admin panel");
psql("delete from login_attempts");

// ---------- کاربرها ----------
const ad = await page();
await admin(ad);
await ad.goto(B + "/admin/users/new");
const nf = ad.locator("form", { has: ad.locator('input[name="fullName"]') });
const newEmail = `guard-staff-${run}@example.com`;
await nf.locator('input[name="fullName"]').fill(`Guard Staff ${run}`);
await nf.locator('input[name="email"]').fill(newEmail);
await nf.locator('input[name="password"]').fill("short");
await nf.locator(`input[name="roles"][value="${psql("select id from roles where key='expert'")}"]`).check();
await nf.getByRole("button", { name: "ساخت کاربر" }).click();
ok((await vis(ad.getByText(/حداقل ۱۲|۱۲ کاراکتر|رمز/).first())) && psql(`select count(*) from users where email='${newEmail}'`) === "0", "weak staff password rejected");
const STAFF_PW = `Guard-Staff-${run}-9!`;
await nf.locator('input[name="password"]').fill(STAFF_PW);
await nf.getByRole("button", { name: "ساخت کاربر" }).click();
ok(await waitFor(() => psql(`select count(*) from users where email='${newEmail}'`) === "1"), "staff user created");
const sid = psql(`select id from users where email='${newEmail}'`);
ok(psql(`select r.key from user_roles ur join roles r on r.id=ur.role_id where ur.user_id='${sid}'`) === "expert", "created with expert role");
const s = await page();
await tryLogin(s, newEmail, STAFF_PW);
ok(s.url().endsWith("/admin"), "new staff user can log in");
// غیرفعال کردن ← نشست بسته و ورود ممنوع
await ad.goto(B + `/admin/users/${sid}`);
await ad.locator('select[name="status"]').selectOption("disabled");
await ad
  .locator("form", { has: ad.locator('select[name="status"]') })
  .getByRole("button", { name: "ذخیره" })
  .click();
ok(await waitFor(() => psql(`select status from users where id='${sid}'`) === "disabled"), "admin disables staff user");
await s.goto(B + "/admin");
ok(s.url().includes("/admin/login"), "disabled user's session ends");
await ad.locator('select[name="status"]').selectOption("active");
await ad
  .locator("form", { has: ad.locator('select[name="status"]') })
  .getByRole("button", { name: "ذخیره" })
  .click();
await waitFor(() => psql(`select status from users where id='${sid}'`) === "active");

// ---------- قفل‌های «فقط ادمین» با سوئیچ خاموش (کارشناس همه‌ی دسترسی‌ها را دارد) ----------
const ex = await page();
await expert(ex);
const exId = psql("select id from users where email='expert@test.local'");
const adminRole = psql("select id from roles where key='admin'");
await ex.goto(B + `/admin/users/${exId}`);
const adminBox = ex.locator(`input[name="roles"][value="${adminRole}"]`);
ok(await adminBox.isDisabled(), "expert: admin-role checkbox locked in UI");
// دور زدن قفل مرورگر: سرور باید خودش رد کند
await adminBox.evaluate((e) => {
  e.disabled = false;
  e.checked = true;
});
await ex.locator("form", { has: adminBox }).getByRole("button", { name: "ذخیره" }).click();
ok(await vis(ex.getByText("فقط ادمین می‌تواند نقش ادمین بدهد یا بگیرد.")), "server rejects expert granting admin (bypassed UI)");
ok(psql(`select count(*) from user_roles where user_id='${exId}' and role_id='${adminRole}'`) === "0", "DB unchanged: expert still not admin");
// حساب ادمین را نمی‌تواند ویرایش کند
const adId = psql("select id from users where email='admin@test.local'");
await ex.goto(B + `/admin/users/${adId}`);
const pwBtn = ex.getByRole("button", { name: "ثبت رمز" });
if (await pwBtn.count()) {
  await ex.locator("form", { has: pwBtn }).locator('input[type="password"]').first().fill(`Hijack-${run}-Pass1!`);
  await pwBtn.evaluate((e) => (e.disabled = false));
  await pwBtn.click();
  await ex.waitForTimeout(800);
}
await tryLogin(g, "admin@test.local", `Hijack-${run}-Pass1!`);
ok(g.url().includes("/admin/login"), "expert cannot change an admin's password");
psql("delete from login_attempts");
// سوئیچ اجرای دسترسی‌ها
await ex.goto(B + "/admin/settings");
const sw = ex.getByRole("switch", { name: /اجرای دسترسی|دسترسی/ }).first();
ok(await sw.isDisabled(), "expert: enforce-permissions switch locked");
await sw.evaluate((e) => (e.disabled = false));
await sw.click();
await ex.waitForTimeout(1000);
ok(psql("select value from settings where key='auth.enforce_permissions'") === "false", "server rejects expert flipping enforce_permissions");
// نقش‌ها: صفحه برای کارشناس فرم ذخیره ندارد؛ پس درخواست واقعی ادمین ضبط و از مرورگر کارشناس دوباره فرستاده می‌شود
// (تکنیک «تست server action از دید مهاجم»، بخش ۱۷)
const expertRole = psql("select id from roles where key='expert'");
const before = psql(`select string_agg(permission_key, ',' order by permission_key) from role_permissions where role_id='${expertRole}'`);
await ad.goto(B + `/admin/roles/${expertRole}`);
const firstPerm = ad.locator('input[name="permissions"]').first();
await firstPerm.setChecked(!(await firstPerm.isChecked()));
let captured = null;
await ad.route("**/admin/roles/**", async (route) => {
  const r = route.request();
  if (r.method() === "POST" && r.headers()["next-action"]) {
    captured = { url: r.url(), headers: r.headers(), body: r.postDataBuffer()?.toString("base64") };
    return route.abort();
  }
  return route.continue();
});
await ad.locator("form", { has: firstPerm }).getByRole("button", { name: "ذخیره" }).click();
await waitFor(() => !!captured, 5000);
await ad.unroute("**/admin/roles/**");
await ad.waitForTimeout(300);
// درخواستِ abortشده در صفحه‌ی ادمین «Failed to fetch» می‌دهد؛ خطای واقعی نیست
for (let i = errs.length - 1; i >= 0; i--) if (errs[i] === "Failed to fetch") errs.splice(i, 1);
ok(!!captured, "captured admin's role-save server action");
await ex.goto(B + `/admin/roles/${expertRole}`);
const replay = await ex.evaluate(async (c) => {
  const body = Uint8Array.from(atob(c.body), (x) => x.charCodeAt(0));
  const h = { ...c.headers };
  delete h["content-length"];
  const r = await fetch(c.url, { method: "POST", headers: h, body });
  return { s: r.status, t: (await r.text()).slice(0, 4000) };
}, captured);
ok(replay.t.includes("فقط ادمین می‌تواند نقش‌ها و دسترسی‌هایشان را بسازد"), `server rejects expert's replayed role edit (${replay.s})`);
ok(psql(`select string_agg(permission_key, ',' order by permission_key) from role_permissions where role_id='${expertRole}'`) === before, "DB unchanged: role permissions");

// ---------- سوئیچ اجرای دسترسی‌ها روشن (فقط ادمین) ----------
await ad.goto(B + "/admin/settings");
await ad
  .getByRole("switch", { name: /اجرای دسترسی|دسترسی/ })
  .first()
  .check();
ok(await waitFor(() => psql("select value from settings where key='auth.enforce_permissions'") === "true"), "admin turns on enforce_permissions");
await ad.goto(B + "/admin");
ok(ad.url().endsWith("/admin"), "admin never locked out by enforcement");
await ex.goto(B + "/admin/users");
ok(/forbidden/.test(ex.url()) || (await vis(ex.getByText(/دسترسی ندارید|اجازه/).first())), "expert without users.manage → forbidden");
await ex.goto(B + "/admin");
ok((await ex.locator('nav a[href="/admin/users"]').count()) === 0, "expert nav hides users");
setS("auth.enforce_permissions", false);

// ---------- «بازگشت» امن بعد از ورود مشتری ----------
const c = await page();
await c.goto(B + "/login?next=" + encodeURIComponent("//evil.example.com/x"));
await c
  .locator("form", { has: c.locator('input[name="password"]') })
  .locator('input[name="identifier"]')
  .fill(custEmail);
await c
  .locator("form", { has: c.locator('input[name="password"]') })
  .locator('input[name="password"]')
  .fill(PW.admin);
await c
  .locator("form", { has: c.locator('input[name="password"]') })
  .getByRole("button", { name: "ورود" })
  .click();
await c.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => {});
ok(new URL(c.url()).host === new URL(B).host, `unsafe next → stays on site (${c.url()})`);

// ---------- لاگ فعالیت ----------
await ad.goto(B + "/admin/activity");
ok((await vis(ad.getByRole("heading", { name: "لاگ فعالیت" }))) && (await ad.locator("table tr").count()) > 1, "activity log lists entries");
ok(Number(psql(`select count(*) from activity_log where entity_id='${sid}'`)) >= 2, "user create/update logged");

psql(`delete from sessions where user_id in (select id from users where email like 'guard-%')`);
psql("delete from login_attempts");
console.log("page errors:", errs.length ? errs : "none");
ok(!errs.length, "no JS page errors");
await b.close();
done();
process.exit();
