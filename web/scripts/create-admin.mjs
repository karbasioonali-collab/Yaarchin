// ساخت اولین ادمین (یا دادن نقش ادمین به کاربر موجود با همین موبایل).
// اطلاعات از ورودی خوانده می‌شود و هیچ‌جا در کد یا ریپو ذخیره نمی‌شود.
//   تعاملی:      npm run create-admin
//   غیرتعاملی:   ADMIN_NAME=... ADMIN_MOBILE=... ADMIN_PASSWORD=... npm run create-admin
import { hash } from "@node-rs/argon2";
import { PASSWORD_HINT, passwordError } from "../src/lib/auth/password-policy.mjs";
import pg from "pg";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL تنظیم نشده است.");
  process.exit(1);
}

function normalizeMobile(input) {
  let s = input.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[\s\-()]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  if (s.startsWith("9") && s.length === 10) s = "0" + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

async function ask(rl, q, { hidden = false } = {}) {
  if (!hidden) return (await rl.question(q)).trim();
  // پنهان کردن رمز هنگام تایپ
  const origWrite = rl._writeToOutput;
  rl._writeToOutput = (s) => (s.includes(q) ? stdout.write(s) : stdout.write("*"));
  const ans = await rl.question(q);
  rl._writeToOutput = origWrite;
  stdout.write("\n");
  return ans;
}

let name = process.env.ADMIN_NAME?.trim();
let mobileRaw = process.env.ADMIN_MOBILE?.trim();
let password = process.env.ADMIN_PASSWORD;
if (!name || !mobileRaw || !password) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  name ||= await ask(rl, "نام و نام خانوادگی: ");
  mobileRaw ||= await ask(rl, "موبایل (09xxxxxxxxx): ");
  password ||= await ask(rl, `رمز (${PASSWORD_HINT}): `, { hidden: true });
  rl.close();
}
const mobile = normalizeMobile(mobileRaw);
if (!name || !mobile) {
  console.error("نام یا موبایل معتبر نیست.");
  process.exit(1);
}
const policy = passwordError(password ?? "");
if (policy) {
  console.error(policy);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("begin");
  const role = await client.query(`select id from roles where key = 'admin'`);
  if (!role.rows[0]) throw new Error("نقش admin وجود ندارد؛ اول npm run db:seed را اجرا کنید.");
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const existing = await client.query(`select id from users where mobile = $1`, [mobile]);
  let userId = existing.rows[0]?.id;
  if (userId) {
    await client.query(`update users set full_name = $1, password_hash = $2, status = 'active' where id = $3`, [name, passwordHash, userId]);
  } else {
    const ins = await client.query(
      `insert into users (full_name, mobile, password_hash) values ($1,$2,$3) returning id`,
      [name, mobile, passwordHash],
    );
    userId = ins.rows[0].id;
  }
  await client.query(`insert into user_roles (user_id, role_id) values ($1,$2) on conflict do nothing`, [userId, role.rows[0].id]);
  await client.query(
    `insert into activity_log (actor_user_id, action, entity_type, entity_id) values (null, 'cli.create_admin', 'user', $1)`,
    [userId],
  );
  await client.query("commit");
  console.log(`ادمین آماده است: ${name} (${mobile}). با موبایل و همین رمز وارد /admin شوید.`);
} catch (e) {
  await client.query("rollback");
  console.error("خطا:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
