// بخش ۵۶: تغییر رمز کاربر از پنل. مدیر اصلی ← همه؛ customers.reset_password ← فقط مشتری؛ رمز کارمند فقط مدیر (سرور هم).
// اجرا: TEST_DB=postgres://…/yarchin_e2e node tests/e2e/password.e2e.mjs
import { B, PW, admin, argon2, customer, done, expert, launch, ok, psql, setS, staffLogin, vis, waitFor } from "./lib.mjs";

const run = Date.now().toString(36);
setS("auth.enforce_permissions", true);
const role = (keys) => {
  psql("delete from role_permissions where role_id=(select id from roles where key='expert')");
  psql(
    `insert into role_permissions (role_id, permission_key) select r.id, k from roles r, unnest(array[${["dashboard.view", ...keys].map((k) => `'${k}'`).join(",")}]) k where r.key='expert'`,
  );
};
role(["customers.view"]);
ok(psql("select count(*) from permissions where key='customers.reset_password' and group_key='customers'") === "1", "seed: permission exists");
ok(psql("select count(*) from role_permissions rp join roles r on r.id=rp.role_id where r.key='admin' and rp.permission_key='customers.reset_password'") === "1", "admin has it");

// کاربرهای تست: کارشناس دوم و ادمین دوم (تا رمز ادمین اصلی تست‌ها عوض نماند)
const mk = async (email, name, roleKey, pw) => {
  const h = await argon2.hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  psql(`insert into users (full_name, email, password_hash) values ('${name}', '${email}', '${h}')`);
  psql(`insert into user_roles (user_id, role_id) select u.id, r.id from users u, roles r where u.email='${email}' and r.key='${roleKey}'`);
  return psql(`select id from users where email='${email}'`);
};
const E2_MAIL = `exp2-${run}@test.local`;
const A2_MAIL = `adm2-${run}@test.local`;
const E2 = await mk(E2_MAIL, `Expert Two ${run}`, "expert", "Expert2-Pass-2026!");
const A2 = await mk(A2_MAIL, `Admin Two ${run}`, "admin", "Admin2-Pass-2026!");
const hashOf = (id) => psql(`select password_hash from users where id='${id}'`);

const { b, errs, page } = await launch();
const C_MAIL = `pwc-${run}@example.com`;
const cp = await page();
const C = await customer(cp, C_MAIL, `PwCust ${run}`);
const ad = await page();
await admin(ad);
const ad2 = await page();
await admin(ad2);
const e2p = await page();
await staffLogin(e2p, E2_MAIL, "Expert2-Pass-2026!");

const card = (p, id = "customer-password-card") => p.getByTestId(id);
const submit = async (p, pw, confirm, id = "customer-password-card") => {
  await card(p, id).locator('input[name="password"]').fill(pw);
  await card(p, id).locator('input[name="passwordConfirm"]').fill(confirm);
  // بدون بررسی مرورگر (minLength) تا قانون خود سرور آزموده شود
  await card(p, id)
    .locator("form")
    .evaluate((f) => (f.noValidate = true));
  await card(p, id).getByRole("button", { name: "ثبت رمز" }).click();
  await waitFor(async () => (await card(p, id).locator('[role="alert"], [role="status"]').count()) > 0, 10000);
  return (await card(p, id).locator('[role="alert"], [role="status"]').first().innerText()).trim();
};
const customerLogin = async (email, pw) => {
  const p = await page();
  psql("delete from login_attempts");
  await p.goto(B + "/login");
  await p.fill('input[name="identifier"]', email);
  await p.fill('input[name="password"]', pw);
  await p
    .locator("form", { has: p.locator('input[name="password"]') })
    .getByRole("button", { name: "ورود" })
    .click();
  const okIn = await p
    .waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  await p.close();
  return okIn;
};
const staffCan = async (email, pw) => {
  const p = await page();
  const r = await staffLogin(p, email, pw)
    .then(() => true)
    .catch(() => false);
  await p.close();
  return r;
};
// ضبط درخواست server action ادمین (بدون اجرا) برای فرستادن دوباره از مرورگر کارشناس (تکنیک بخش ۱۷)
const capture = async (p, pattern, act) => {
  let c = null;
  await p.route(pattern, async (route) => {
    const r = route.request();
    if (r.method() === "POST" && r.headers()["next-action"]) {
      c = { url: r.url(), headers: r.headers(), body: r.postDataBuffer()?.toString("base64") };
      return route.abort();
    }
    return route.continue();
  });
  await act();
  await waitFor(() => !!c, 5000);
  await p.unroute(pattern);
  await p.waitForTimeout(300);
  for (let i = errs.length - 1; i >= 0; i--) if (errs[i] === "Failed to fetch") errs.splice(i, 1);
  return c;
};
const replay = (p, c) =>
  p.evaluate(async (c) => {
    const body = Uint8Array.from(atob(c.body), (x) => x.charCodeAt(0));
    const h = { ...c.headers };
    delete h["content-length"];
    const r = await fetch(c.url, { method: "POST", headers: h, body });
    return { s: r.status, t: (await r.text()).slice(0, 4000) };
  }, c);

// ---------- مدیر ← مشتری ----------
await ad.goto(B + `/admin/customers/${C}`);
ok(await vis(card(ad)), "admin: password card on the customer page");
ok(
  (await card(ad)
    .locator('input[type="password"]')
    .evaluateAll((els) => els.map((e) => e.value).join(""))) === "",
  "old password never shown",
);
const h0 = hashOf(C);
let msg = await submit(ad, "abc1234", "abc1234");
ok(msg === "رمز باید حداقل ۸ کاراکتر باشد." && hashOf(C) === h0, `weak rejected (customer signup rule) (${msg})`);
await ad.reload();
msg = await submit(ad, "abcd12345", "abcd12346");
ok(msg === "رمز و تکرار آن یکی نیستند." && hashOf(C) === h0, "mismatch rejected");
await ad.reload();
const capCust = await capture(ad, "**/admin/customers/**", async () => {
  await card(ad).locator('input[name="password"]').fill(`Forged-${run}`);
  await card(ad).locator('input[name="passwordConfirm"]').fill(`Forged-${run}`);
  await card(ad).getByRole("button", { name: "ثبت رمز" }).click();
});
ok(!!capCust && hashOf(C) === h0, "captured admin's customer-password request (not applied)");
await ad.reload();
const NEW_C = `NewCust-${run}`;
msg = await submit(ad, NEW_C, NEW_C);
ok(msg.includes("رمز تغییر کرد") && hashOf(C) !== h0, `admin changed the customer's password (${msg})`);
await cp.goto(B + "/account");
ok(cp.url().includes("/login"), `customer's previous session closed (${cp.url()})`);
ok((await customerLogin(C_MAIL, NEW_C)) && !(await customerLogin(C_MAIL, PW.customer)), "new password works, old does not");
const log = psql(
  `select a.action || '|' || u.email || '|' || coalesce(a.after::text, '') from activity_log a join users u on u.id=a.actor_user_id where a.entity_id='${C}' and a.action='customer.set_password' order by a.id desc limit 1`,
);
ok(log.startsWith("customer.set_password|admin@test.local|") && !log.includes(NEW_C) && !log.includes("Forged"), `logged without the password (${log})`);

// ---------- کارشناس بدون دسترسی ----------
const ex = await page();
await expert(ex);
await ex.goto(B + `/admin/customers/${C}`);
ok((await card(ex).count()) === 0, "expert without customers.reset_password: no card");
let h1 = hashOf(C);
let r = await replay(ex, capCust);
ok(hashOf(C) === h1 && r.t.includes("دسترسی «تغییر رمز مشتری‌ها» لازم است"), `server rejects the replayed request (${r.s})`);

// ---------- کارشناس با دسترسی ← مشتری ----------
role(["customers.view", "customers.reset_password"]);
await ex.reload();
ok(await vis(card(ex)), "expert with customers.reset_password: card visible");
h1 = hashOf(C);
msg = await submit(ex, `ByExpert-${run}`, `ByExpert-${run}`);
ok(msg.includes("رمز تغییر کرد") && hashOf(C) !== h1, "expert changed the customer's password");
ok(
  psql(`select count(*) from activity_log a join users u on u.id=a.actor_user_id where a.entity_id='${C}' and a.action='customer.set_password' and u.email='expert@test.local'`) ===
    "1",
  "logged as the expert",
);

// ---------- کارشناس ← کارشناس یا ادمین: رد (فرم دستکاری‌شده) ----------
for (const [target, label] of [
  [E2, "expert"],
  [A2, "admin"],
]) {
  await ex.goto(B + `/admin/customers/${C}`);
  await card(ex)
    .locator('input[name="id"]')
    .evaluate((e, v) => (e.value = v), target);
  const hb = hashOf(target);
  msg = await submit(ex, `Hijack-${run}-Pass1!`, `Hijack-${run}-Pass1!`);
  ok(msg.includes("این حساب کارمند است") && hashOf(target) === hb, `expert cannot change an ${label}'s password via the customer form (${msg})`);
}

// ---------- مدیر ← کارشناس (قانون رمز پنل) ----------
await ad.goto(B + `/admin/users/${E2}`);
ok(await vis(card(ad, "password-card")), "admin: password card on the staff page");
const hE = hashOf(E2);
msg = await submit(ad, "abcd12345", "abcd12345", "password-card");
ok(msg.includes("حداقل ۱۲ کاراکتر") && hashOf(E2) === hE, `staff: panel rule (${msg})`);
await ad.reload();
const capStaff = await capture(ad, "**/admin/users/**", async () => {
  await card(ad, "password-card").locator('input[name="password"]').fill(`Forged-${run}-Pass1!`);
  await card(ad, "password-card").locator('input[name="passwordConfirm"]').fill(`Forged-${run}-Pass1!`);
  await card(ad, "password-card").getByRole("button", { name: "ثبت رمز" }).click();
});
await ad.reload();
const NEW_E = `NewExpert-${run}-Pass1!`;
msg = await submit(ad, NEW_E, NEW_E, "password-card");
ok(msg.includes("رمز تغییر کرد") && hashOf(E2) !== hE, "admin changed the expert's password");
await e2p.goto(B + "/admin");
ok(e2p.url().includes("/admin/login"), "expert's previous session closed");
ok(await staffCan(E2_MAIL, NEW_E), "expert logs in with the new password");

// کارشناس با users.manage: کارت نیست و سرور رد می‌کند
role(["customers.view", "customers.reset_password", "users.view", "users.manage"]);
await ex.goto(B + `/admin/users/${E2}`);
ok((await card(ex, "password-card").count()) === 0, "expert (even with users.manage): no staff password card");
h1 = hashOf(E2);
r = await replay(ex, capStaff);
ok(hashOf(E2) === h1 && r.t.includes("فقط مدیر اصلی"), `server rejects expert's replayed staff-password request (${r.s})`);

// ---------- مدیر ← ادمین دیگر ----------
await ad.goto(B + `/admin/users/${A2}`);
const NEW_A = `NewAdmin-${run}-Pass1!`;
msg = await submit(ad, NEW_A, NEW_A, "password-card");
ok(msg.includes("رمز تغییر کرد") && (await staffCan(A2_MAIL, NEW_A)), "admin changed another admin's password");

// ---------- مدیر ← خودش: این نشست می‌ماند، نشست دیگرش بسته ----------
const adminId = psql("select id from users where email='admin@test.local'");
await ad.goto(B + `/admin/users/${adminId}`);
const TMP = `TmpAdmin-${run}-Pass1!`;
msg = await submit(ad, TMP, TMP, "password-card");
ok(msg.includes("این نشست می‌ماند"), `own password (${msg})`);
await ad.goto(B + "/admin");
ok(ad.url().endsWith("/admin"), "own current session kept");
await ad2.goto(B + "/admin");
ok(ad2.url().includes("/admin/login"), "own other session closed");
await ad.goto(B + `/admin/users/${adminId}`);
msg = await submit(ad, PW.admin, PW.admin, "password-card");
ok(msg.includes("رمز تغییر کرد") && (await staffCan("admin@test.local", PW.admin)), "restored the test admin password");

// ---------- قفل موقت ورود پاک می‌شود ----------
psql(`insert into login_attempts (identifier, step, success) select '${C_MAIL}', 'password', false from generate_series(1, 6)`);
await ad.goto(B + `/admin/customers/${C}`);
msg = await submit(ad, NEW_C, NEW_C);
ok(psql(`select count(*) from login_attempts where identifier='${C_MAIL}' and not success`) === "0", "temporary login lock cleared");
ok(psql("select count(*) from activity_log where action='user.set_password' and created_at > now() - interval '10 minutes'") !== "0", "staff password changes logged");

role([]);
setS("auth.enforce_permissions", false);
ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(" | ")})`);
await b.close();
done();
process.exit();
