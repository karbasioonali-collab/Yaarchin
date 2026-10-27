#!/bin/bash
# همه‌ی تست‌ها از صفر، به ترتیب درست (docs/infoyaarchin.md بخش ۲۲). فقط Postgres و سرور محلی؛ هرگز روی لیارا.
#   bash tests/run-all.sh              ← دیتابیس‌های تازه + build + همه‌ی تست‌ها (حدود ۹ دقیقه)
#   bash tests/run-all.sh --no-setup   ← همان دیتابیس‌های قبلی (فقط seed-demo پیش از هر تست)
#   bash tests/run-all.sh --no-build   ← همان build قبلی
#   bash tests/run-all.sh --only chat  ← فقط یک تست (اسم فایل بدون .e2e.mjs؛ ai-test و ai-live هم)
# متغیرها: PG_URL (پیش‌فرض postgres://yarchin:devpass@localhost)، E2E_DB (yarchin_e2e)، E2E_PRE_DB (yarchin_e2e_pre)
set -uo pipefail
cd "$(dirname "$0")/.."
PG_URL=${PG_URL:-postgres://yarchin:devpass@localhost}
DB=${E2E_DB:-yarchin_e2e}
PRE_DB=${E2E_PRE_DB:-yarchin_e2e_pre}
# تست «قبل از migrate» فقط برای آخرین migration نگه داشته می‌شود: با migration تازه این دو عوض می‌شوند (بخش ۲۲)
PRE_UPTO=0009
PRE_TEST=ai-pre
SETUP=1 BUILD=1 ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in --no-setup) SETUP=0 ;; --no-build) BUILD=0 ;; --only) ONLY=$2; shift ;; *) echo "گزینه‌ی ناشناخته: $1"; exit 2 ;; esac
  shift
done
export TEST_DB="$PG_URL/$DB"
# بعد از ری‌استارت محیط توسعه Postgres خاموش است (بخش ۲۲)
psql "$PG_URL/postgres" -qAtc "select 1" >/dev/null 2>&1 || { echo "Postgres محلی در دسترس نیست؛ اول: service postgresql start" >&2; exit 1; }
MOCK_ENV=(AI_BASE_URL=http://127.0.0.1:3399/v1 AI_API_KEY=test AI_MODEL=mock/primary AI_FALLBACK_MODEL=mock/fallback)
# ترتیب لازم: سایت ← محتوای سایت ← امتیاز …؛ کاتالوگ همیشه آخر
ORDER=(site admin-site score rates chat customer icons guard followup media import reports ai-test ai-live "$PRE_TEST" catalog)

if [ "$SETUP" = 1 ]; then
  bash tests/e2e/setup-db.sh "$DB" || exit 1
  bash tests/e2e/setup-db.sh "$PRE_DB" --upto "$PRE_UPTO" || exit 1
fi
if [ "$BUILD" = 1 ]; then bash tests/e2e/serve.sh "$DB" --build || exit 1; else bash tests/e2e/serve.sh "$DB" || exit 1; fi
SERVER=normal

reset_data() {
  psql "$TEST_DB" -qAtc "delete from site_blocks; delete from contact_messages; delete from login_attempts" >/dev/null
  DATABASE_URL="$TEST_DB" npm run -s db:seed-demo >/dev/null 2>&1
}
serve() { # serve <normal|live|pre>
  [ "$SERVER" = "$1" ] && return 0
  case "$1" in
    normal) bash tests/e2e/serve.sh "$DB" >/dev/null ;;
    live) bash tests/e2e/serve.sh "$DB" "${MOCK_ENV[@]}" >/dev/null ;;
    pre) bash tests/e2e/serve.sh "$PRE_DB" >/dev/null ;;
  esac
  SERVER=$1
}

node tests/unit/run.mjs; UNIT=$?
declare -a RESULTS
FAILED=0
for t in "${ORDER[@]}"; do
  [ -n "$ONLY" ] && [ "$ONLY" != "$t" ] && continue
  file=tests/e2e/$t.e2e.mjs; env=(); db="$TEST_DB"
  case "$t" in
    ai-test) file=tests/e2e/ai.e2e.mjs; env=(AI_E2E=test); serve normal ;;
    ai-live) file=tests/e2e/ai.e2e.mjs; env=(AI_E2E=live); serve live ;;
    "$PRE_TEST") db="$PG_URL/$PRE_DB"; serve pre ;;
    *) serve normal; reset_data ;;
  esac
  start=$(date +%s)
  out=$(env TEST_DB="$db" "${env[@]}" timeout 900 node "$file" 2>&1)
  code=$?
  summary=$(echo "$out" | grep -E "ALL PASSED|FAILED \(" | tail -1)
  [ -z "$summary" ] && summary="CRASHED (exit $code)"
  [ $code -ne 0 ] && { FAILED=$((FAILED + 1)); echo "$out" | grep -E "^FAIL|Error|error" | head -15; }
  RESULTS+=("$(printf '%-12s %-28s %4ss' "$t" "$summary" $(($(date +%s) - start)))")
  echo "${RESULTS[-1]}"
done
serve normal

echo; echo "===== نتیجه ====="
printf '%s\n' "${RESULTS[@]}"
[ $UNIT -ne 0 ] && echo "unit tests FAILED"
if [ $FAILED -eq 0 ] && [ $UNIT -eq 0 ]; then echo "همه‌ی تست‌ها سبز ✓"; else echo "$FAILED مجموعه‌ی e2e ناموفق"; exit 1; fi
