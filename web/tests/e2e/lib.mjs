// کمک‌های مشترک تست‌های e2e (Playwright). فقط روی Postgres محلی (TEST_DB) و سرور محلی (BASE_URL، پیش‌فرض :3300).
// چرا در ریپو: تست‌های قبلی بیرون از ریپو (scratchpad) بودند و با ری‌استارت محیط توسعه پاک شدند؛ docs/infoyaarchin.md بخش ۲۹.
// حساب‌های تست فقط در دیتابیس محلی ساخته می‌شوند (tests/e2e/setup-db.sh). رمزها از متغیر محیطی TEST_ADMIN_PASSWORD،
// TEST_EXPERT_PASSWORD و TEST_CUSTOMER_PASSWORD خوانده می‌شوند؛ پیش‌فرض‌ها فقط برای سندباکس محلی‌اند و هیچ‌جای دیگری کار نمی‌کنند.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE ?? "/opt/node22/lib/node_modules/playwright";
export const { chromium, devices } = require(pwPath);
const webRequire = createRequire(new URL("../../package.json", import.meta.url));
export const argon2 = webRequire("@node-rs/argon2");

export const B = process.env.BASE_URL ?? "http://127.0.0.1:3300";
export const DB = process.env.TEST_DB;
if (!DB) throw new Error("TEST_DB لازم است (مثلاً postgres://yarchin:devpass@localhost/yarchin_full)");
// ایمنی: این تست‌ها داده را عوض و پاک می‌کنند؛ هرگز روی دیتابیس یا سایت غیرمحلی (لیارا) اجرا نشوند.
const host = (u) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};
if (!["localhost", "127.0.0.1", "::1", ""].includes(host(DB)) || !["localhost", "127.0.0.1"].includes(host(B)))
  throw new Error(`تست‌ها فقط روی دیتابیس و سرور محلی اجرا می‌شوند (TEST_DB=${host(DB)}، BASE_URL=${host(B)})`);
export const PW = {
  admin: process.env.TEST_ADMIN_PASSWORD ?? "Str0ng!Passw0rd",
  expert: process.env.TEST_EXPERT_PASSWORD ?? "Expert-Pass-2026!",
  customer: process.env.TEST_CUSTOMER_PASSWORD ?? "Cust-Pass-2026!",
};

export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = "/opt/pw-browsers";
  for (const d of existsSync(base) ? readdirSync(base) : []) {
    for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) if (d.startsWith("chromium-") && existsSync(`${base}/${d}/${sub}`)) return `${base}/${d}/${sub}`;
  }
  return undefined;
}

// بدون shell (هش رمز «$» دارد و shell آن را عوض می‌کرد)
export const psql = (q) => {
  try {
    return execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-Atc", q], { stdio: ["ignore", "pipe", "pipe"] })
      .toString()
      .trim();
  } catch (e) {
    throw new Error(
      `psql: ${
        String(e.stderr ?? e.message)
          .trim()
          .split("\n")[0]
      }\n  ${q.slice(0, 300)}`,
    );
  }
};
export const setS = (k, v) => psql(`update settings set value='${JSON.stringify(v).replace(/'/g, "''")}' where key='${k}'`);

let fails = 0;
let count = 0;
export const ok = (c, m) => {
  count++;
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fails++;
};
export const done = () => {
  console.log(fails ? `\n${fails} FAILED (${count} checks)` : `\nALL PASSED (${count} checks)`);
  process.exitCode = fails ? 1 : 0;
};
export const vis = (l, t = 8000) =>
  l
    .first()
    .waitFor({ state: "visible", timeout: t })
    .then(
      () => true,
      () => false,
    );
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const waitFor = async (fn, ms = 15000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await fn()) return true;
    await sleep(300);
  }
  return fn();
};

export async function launch() {
  const b = await chromium.launch({ executablePath: chromePath() });
  const errs = [];
  const page = async (opts = {}) => {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, ...opts })).newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    // پنجره‌های تأیید («گفتگو بسته شود؟» و …) پذیرفته می‌شوند؛ پیش‌فرض Playwright رد کردن است
    p.on("dialog", (d) => d.accept().catch(() => {}));
    return p;
  };
  return { b, errs, page };
}

export async function staffLogin(p, id, pw) {
  psql("delete from login_attempts");
  await p.goto(B + "/admin/login");
  await p.fill('input[name="identifier"]', id);
  await p.fill('input[name="password"]', pw);
  await p.getByRole("button", { name: "ورود" }).click();
  await p.waitForURL(/\/admin$/);
}
export const admin = (p) => staffLogin(p, "admin@test.local", PW.admin);
export const expert = (p) => staffLogin(p, "expert@test.local", PW.expert);

// مشتری تست (ساخت مستقیم در دیتابیس محلی) و ورود از /login
export async function customer(p, email, name = "Test Customer") {
  psql(`delete from login_attempts`);
  const hash = await argon2.hash(PW.customer, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  if (psql(`select count(*) from users where email='${email}'`) === "0") {
    psql(`insert into users (full_name, email, password_hash) values ('${name}', '${email}', '${hash}')`);
    psql(`insert into user_roles (user_id, role_id) select u.id, r.id from users u, roles r where u.email='${email}' and r.key='customer'`);
  }
  await p.goto(B + "/login");
  await p.fill('input[name="identifier"]', email);
  await p.fill('input[name="password"]', PW.customer);
  await p
    .locator("form", { has: p.locator('input[name="password"]') })
    .getByRole("button", { name: "ورود" })
    .click();
  await p
    .waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 })
    .catch(async () => {
      throw new Error(`customer login failed: ${(await p.locator("form").first().innerText()).slice(0, 200)}`);
    });
  return psql(`select id from users where email='${email}'`);
}

// API مشتری از داخل مرورگر (کوکی همان صفحه)
export const api = (p, method, path, body) =>
  p.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(u, { method: m, headers: b ? { "content-type": "application/json" } : {}, body: b ? JSON.stringify(b) : undefined });
      let j = null;
      try {
        j = await r.json();
      } catch {}
      return { s: r.status, j };
    },
    [method, path, body],
  );
