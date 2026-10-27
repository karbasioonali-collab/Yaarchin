#!/bin/bash
# ساخت یک دیتابیس تست محلی از صفر: migrate (همه، یا فقط تا یک migration برای تست «قبل از migrate»)، seed، seed-demo و دو حساب تست.
# فقط Postgres محلی سندباکس؛ هرگز روی لیارا. docs/infoyaarchin.md بخش ۲۲.
#   bash tests/e2e/setup-db.sh yarchin_full            ← همه‌ی migrationها
#   bash tests/e2e/setup-db.sh yarchin_pre --upto 0009 ← فقط ۰۰۰۰ تا ۰۰۰۹ (مثل لیارا بعد از استقرار و قبل از migrate)
# متغیرها: PG_URL (پیش‌فرض postgres://yarchin:devpass@localhost)، TEST_ADMIN_PASSWORD، TEST_EXPERT_PASSWORD (همان پیش‌فرض‌های lib.mjs)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${1:?اسم دیتابیس}
UPTO=""
[ "${2:-}" = "--upto" ] && UPTO=${3:?شماره‌ی migration، مثلاً 0009}
PG_URL=${PG_URL:-postgres://yarchin:devpass@localhost}
case "$PG_URL" in *localhost*|*127.0.0.1*) ;; *) echo "فقط Postgres محلی" >&2; exit 1 ;; esac
export DATABASE_URL="$PG_URL/$DB"

# دیتابیس تازه (نقش yarchin باید CREATEDB داشته باشد، یا با کاربر postgres)
if ! psql "$PG_URL/postgres" -qc "drop database if exists $DB" -c "create database $DB" 2>/dev/null; then
  su postgres -c "psql -qc 'drop database if exists $DB' -c 'create database $DB owner yarchin'"
fi

if [ -n "$UPTO" ]; then
  TMP=$(mktemp -d)
  mkdir -p "$TMP/meta"
  for f in drizzle/*.sql; do n=$(basename "$f" | cut -c1-4); [ "$n" \> "$UPTO" ] || cp "$f" "$TMP/"; done
  node -e '
    const j = require("./drizzle/meta/_journal.json");
    j.entries = j.entries.filter((e) => e.tag.slice(0, 4) <= process.argv[1]);
    require("fs").writeFileSync(process.argv[2] + "/meta/_journal.json", JSON.stringify(j, null, 2));
  ' "$UPTO" "$TMP"
  node --input-type=module -e '
    import { drizzle } from "drizzle-orm/node-postgres";
    import { migrate } from "drizzle-orm/node-postgres/migrator";
    import pg from "pg";
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    await migrate(drizzle(pool), { migrationsFolder: process.argv[1] });
    await pool.end();
    console.log("migrationها تا " + process.argv[2] + " اعمال شدند.");
  ' "$TMP" "$UPTO"
  rm -rf "$TMP"
else
  npm run -s db:migrate
fi
npm run -s db:seed | tail -1
npm run -s db:seed-demo | tail -1
ADMIN_NAME="Test Admin" ADMIN_EMAIL=admin@test.local ADMIN_PASSWORD="${TEST_ADMIN_PASSWORD:-Str0ng!Passw0rd}" npm run -s create-admin | tail -1
ADMIN_NAME="Test Expert" ADMIN_EMAIL=expert@test.local ADMIN_PASSWORD="${TEST_EXPERT_PASSWORD:-Expert-Pass-2026!}" npm run -s create-admin | tail -1
psql "$DATABASE_URL" -qAtc "update user_roles set role_id=(select id from roles where key='expert') where user_id=(select id from users where email='expert@test.local')"
echo "دیتابیس $DB آماده است."
