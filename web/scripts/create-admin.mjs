// ساخت اولین ادمین (یا دادن نقش ادمین به کاربر موجود با همین موبایل/ایمیل).
// ورود بعداً با موبایل یا ایمیل ممکن است؛ حداقل یکی لازم است، هر دو هم می‌شود.
// اطلاعات از ورودی خوانده می‌شود و هیچ‌جا در کد یا ریپو ذخیره نمی‌شود.
//   تعاملی:      npm run create-admin
//   غیرتعاملی:   ADMIN_NAME=... ADMIN_MOBILE=... ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run create-admin
//                (یکی از ADMIN_MOBILE یا ADMIN_EMAIL کافی است)
import { hash } from "@node-rs/argon2";
import { PASSWORD_HINT, passwordError } from "../src/lib/auth/password-policy.mjs";
import { normalizeEmail, normalizeMobile } from "../src/lib/contact.mjs";
import pg from "pg";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL تنظیم نشده است.");
  process.exit(1);
}

// خواندن خط‌به‌خط با iterator (نه rl.question) تا هم در ترمینال کنسول لیارا و هم با ورودی pipe‌شده درست کار کند.
// پنهان کردن رمز: readline هر چه کاربر تایپ می‌کند را در output خودش echo می‌کند؛ این output را موقع رمز «بی‌صدا» می‌کنیم.
// (ترفند قدیمی rl._writeToOutput در Node 24 دیگر کار نمی‌کند و رمز دیده می‌شد.)
function makeAsker() {
  let muted = false;
  const output = new Writable({
    write(chunk, enc, cb) {
      if (!muted) stdout.write(chunk, enc);
      cb();
    },
  });
  const rl = readline.createInterface({ input: stdin, output, terminal: Boolean(stdin.isTTY) });
  const lines = rl[Symbol.asyncIterator]();
  async function ask(q, { hidden = false } = {}) {
    stdout.write(q);
    muted = hidden;
    const { value, done } = await lines.next();
    muted = false;
    if (hidden) stdout.write("\n");
    return done ? "" : String(value).trim();
  }
  return { ask, close: () => rl.close() };
}

let name = process.env.ADMIN_NAME?.trim() ?? "";
let mobileRaw = process.env.ADMIN_MOBILE?.trim() ?? "";
let emailRaw = process.env.ADMIN_EMAIL?.trim() ?? "";
let password = process.env.ADMIN_PASSWORD ?? "";
// اگر از env چیزی داده شده، حالت غیرتعاملی است؛ وگرنه سؤال می‌پرسیم.
const interactive = !process.env.ADMIN_NAME && !process.env.ADMIN_PASSWORD;
if (interactive) {
  const { ask, close } = makeAsker();
  name = await ask("نام و نام خانوادگی: ");
  console.log("برای ورود، موبایل یا ایمیل (یا هر دو) لازم است. هر کدام را نمی‌خواهید، خالی بگذارید و Enter بزنید.");
  mobileRaw = await ask("موبایل (09xxxxxxxxx): ");
  emailRaw = await ask("ایمیل: ");
  password = await ask(`رمز (${PASSWORD_HINT}): `, { hidden: true });
  close();
}

if (!name) {
  console.error("نام لازم است.");
  process.exit(1);
}
const mobile = mobileRaw ? normalizeMobile(mobileRaw) : null;
if (mobileRaw && !mobile) {
  console.error("موبایل معتبر نیست (مثل 09121234567).");
  process.exit(1);
}
const email = emailRaw ? normalizeEmail(emailRaw) : null;
if (emailRaw && !email) {
  console.error("ایمیل معتبر نیست.");
  process.exit(1);
}
if (!mobile && !email) {
  console.error("موبایل یا ایمیل لازم است (حداقل یکی).");
  process.exit(1);
}
const policy = passwordError(password);
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

  // کاربر موجود با همین موبایل یا ایمیل؟ اگر موبایل مال یک نفر و ایمیل مال نفر دیگری است، ادامه نمی‌دهیم.
  const found = await client.query(
    `select id, mobile, email from users where ($1::text is not null and mobile = $1) or ($2::text is not null and lower(email) = $2)`,
    [mobile, email],
  );
  if (found.rows.length > 1) {
    throw new Error("این موبایل و این ایمیل متعلق به دو کاربر متفاوت‌اند. یکی را اصلاح کنید.");
  }
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const existing = found.rows[0];
  let userId = existing?.id;
  if (existing) {
    // موبایل یا ایمیلِ ثبت‌شده‌ی یک کاربر موجود را اینجا عوض نمی‌کنیم (فقط اگر خالی است پر می‌شود)؛
    // تغییرش از پنل (کاربران) انجام شود تا در لاگ فعالیت با مقدار قبل/بعد ثبت شود.
    if (mobile && existing.mobile && existing.mobile !== mobile) {
      throw new Error(`این کاربر (با ایمیل ${existing.email}) موبایل دیگری دارد؛ موبایل را از پنل تغییر دهید.`);
    }
    if (email && existing.email && existing.email.toLowerCase() !== email) {
      throw new Error(`این کاربر (با موبایل ${existing.mobile}) ایمیل دیگری دارد؛ ایمیل را از پنل تغییر دهید.`);
    }
    await client.query(
      `update users set full_name = $1, password_hash = $2, status = 'active',
         mobile = coalesce(mobile, $3), email = coalesce(email, $4)
       where id = $5`,
      [name, passwordHash, mobile, email, userId],
    );
  } else {
    const ins = await client.query(
      `insert into users (full_name, mobile, email, password_hash) values ($1,$2,$3,$4) returning id`,
      [name, mobile, email, passwordHash],
    );
    userId = ins.rows[0].id;
  }
  await client.query(`insert into user_roles (user_id, role_id) values ($1,$2) on conflict do nothing`, [userId, role.rows[0].id]);
  await client.query(
    `insert into activity_log (actor_user_id, action, entity_type, entity_id) values (null, 'cli.create_admin', 'user', $1)`,
    [userId],
  );
  await client.query("commit");
  const ids = [mobile, email].filter(Boolean).join(" یا ");
  console.log(`ادمین آماده است: ${name}. با ${ids} و همین رمز وارد /admin شوید.`);
} catch (e) {
  await client.query("rollback");
  console.error("خطا:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
