// داده‌ی پایه: نقش‌ها، دسترسی‌ها، اتصال نقش↔دسترسی و تنظیمات پیش‌فرض.
// قابل اجرای مکرر: فقط موارد نبوده را اضافه می‌کند؛ مقدار تنظیماتی که ادمین عوض کرده دست نمی‌خورد.
import pg from "pg";
import seed from "../src/db/seed-data.json" with { type: "json" };

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL تنظیم نشده است.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("begin");

  for (const r of seed.roles) {
    await client.query(
      // ستون requires_2fa دیگر استفاده نمی‌شود (ورود دومرحله‌ای حذف شد) و مقدار پیش‌فرض false می‌گیرد.
      `insert into roles (key, name_fa, name_en, description, is_system, is_staff)
       values ($1,$2,$3,$4,$5,$6) on conflict (key) do nothing`,
      [r.key, r.nameFa, r.nameEn, r.description, r.isSystem, r.isStaff],
    );
  }

  for (const p of seed.permissions) {
    await client.query(
      `insert into permissions (key, group_key, name_fa) values ($1,$2,$3)
       on conflict (key) do update set group_key = excluded.group_key, name_fa = excluded.name_fa`,
      [p.key, p.groupKey, p.nameFa],
    );
  }

  // فقط برای نقش‌هایی که هنوز هیچ دسترسی‌ای ندارند (تا تنظیمات دستی ادمین پاک نشود)
  for (const [roleKey, perms] of Object.entries(seed.rolePermissions)) {
    const { rows } = await client.query(
      `select r.id, (select count(*) from role_permissions rp where rp.role_id = r.id)::int as n
       from roles r where r.key = $1`,
      [roleKey],
    );
    if (!rows[0]) continue;
    const list = perms === "*" ? seed.permissions.map((p) => p.key) : perms;
    if (perms !== "*" && rows[0].n > 0) continue;
    for (const k of list) {
      await client.query(
        `insert into role_permissions (role_id, permission_key) values ($1,$2) on conflict do nothing`,
        [rows[0].id, k],
      );
    }
  }

  for (const s of seed.settings) {
    await client.query(
      `insert into settings (key, group_key, value, label_fa, description) values ($1,$2,$3,$4,$5)
       on conflict (key) do update set group_key = excluded.group_key, label_fa = excluded.label_fa, description = excluded.description`,
      [s.key, s.groupKey, JSON.stringify(s.value), s.labelFa ?? null, s.description ?? null],
    );
  }

  await client.query("commit");
  console.log("seed انجام شد.");
} catch (e) {
  await client.query("rollback");
  console.error("خطا در seed:", e);
  process.exitCode = 1;
} finally {
  await client.end();
}
