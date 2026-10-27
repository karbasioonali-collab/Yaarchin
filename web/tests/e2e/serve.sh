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
pkill -f "next-server|standalone/server.js" 2>/dev/null || true
sleep 1
(cd .next/standalone && env PORT=3300 HOSTNAME=127.0.0.1 DATABASE_URL="$PG_URL/$DB" "$@" setsid nohup node server.js > ../e2e-server.log 2>&1 &)
for _ in $(seq 1 30); do
  if curl -s http://127.0.0.1:3300/api/v1/health | grep -q '"db":"up"'; then echo "سرور آماده است ($DB)"; exit 0; fi
  sleep 1
done
echo "سرور بالا نیامد:"; tail -20 .next/e2e-server.log; exit 1
