#!/bin/bash
# سرور تولیدی (standalone) برای تست e2e روی 127.0.0.1:3300، با دیتابیس محلی. سرور قبلی همین پورت متوقف می‌شود.
#   bash tests/e2e/serve.sh yarchin_full --build                 ← build تازه و اجرا
#   bash tests/e2e/serve.sh yarchin_full                         ← اجرای همان build قبلی
#   bash tests/e2e/serve.sh yarchin_full AI_BASE_URL=… AI_API_KEY=…  ← متغیرهای اضافه برای سرور
# لاگ سرور: .next/e2e-server.log. docs/infoyaarchin.md بخش ۲۲.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${1:?اسم دیتابیس}
shift
if [ "${1:-}" = "--build" ]; then
  shift
  npm run -s build > .next-build.log 2>&1 || { tail -40 .next-build.log; exit 1; }
  grep -E "Next.js|Compiled|verify-standalone" .next-build.log | head -3
  rm -f .next-build.log
  # standalone فایل‌های static و public را خودش کپی نمی‌کند
  cp -r .next/static .next/standalone/.next/static
  cp -r public .next/standalone/public
fi
[ -f .next/standalone/server.js ] || { echo "اول با --build بسازید" >&2; exit 1; }
PG_URL=${PG_URL:-postgres://yarchin:devpass@localhost}
# فقط خود پروسه‌ی سرور: خط فرمانش با «next-server» یا «node server.js» شروع می‌شود (Next اسم پروسه را «next-server (v…)» می‌کند).
# الگوی لنگردار ^ لازم است: «pkill -f» با الگوی آزاد، شِلی را هم که این کلمه در فرمانش بود می‌بست (بخش ۲۲).
pkill -f "^next-server" 2>/dev/null || true
pkill -f "^node server.js" 2>/dev/null || true
for _ in $(seq 1 10); do curl -s -o /dev/null http://127.0.0.1:3300/ || break; sleep 1; done
if curl -s -o /dev/null http://127.0.0.1:3300/; then echo "پورت ۳۳۰۰ هنوز مشغول است (سرور قبلی بسته نشد)" >&2; exit 1; fi
# همه‌ی ورودی/خروجی‌های پروسه‌ی پس‌زمینه بسته می‌شوند؛ وگرنه «serve.sh | tail» یا «$(run-all …)» تا خاموشی سرور منتظر می‌ماند
(cd .next/standalone && env PORT=3300 HOSTNAME=127.0.0.1 DATABASE_URL="$PG_URL/$DB" "$@" setsid nohup node server.js > ../e2e-server.log 2>&1 < /dev/null &) > /dev/null 2>&1 < /dev/null
for _ in $(seq 1 30); do
  if curl -s http://127.0.0.1:3300/api/v1/health | grep -q '"db":"up"'; then echo "سرور آماده است ($DB)"; exit 0; fi
  sleep 1
done
echo "سرور بالا نیامد:"; tail -20 .next/e2e-server.log; exit 1
