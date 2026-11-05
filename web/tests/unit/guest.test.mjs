// تست واحد بخش ۴۸: شمردن بازدید مهمان — ربات و prefetch، شناسه‌ی مهمان، محدودیت سرعت (اصلی بر اساس مهمان، IP خیلی بالاتر برای CGNAT).
import {
  GUEST_DAILY_EVENT_CAP,
  GUEST_MERGE_DAYS,
  GUEST_PER_MINUTE,
  GUEST_RETENTION_DAYS,
  GUEST_VIEW_DEDUPE_MS,
  IP_PER_MINUTE,
  isBot,
  isPrefetch,
  MinuteLimiter,
  newGuestId,
  validGuestId,
} from "../../src/lib/site/guest-core.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};

// ---------- ربات ----------
const HUMAN = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0",
];
const BOTS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 11; moto g power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 Chrome-Lighthouse",
  "curl/8.5.0",
  "python-requests/2.31.0",
  "Wget/1.21",
  "facebookexternalhit/1.1",
  "TelegramBot (like TwitterBot)",
  "",
  "x",
];
for (const u of HUMAN) ok(!isBot(u), `human: ${u.slice(0, 40)}`);
for (const u of BOTS) ok(isBot(u), `bot: «${u.slice(0, 40)}»`);
ok(isBot(null) && isBot(undefined), "missing user agent = bot");

// ---------- prefetch ----------
const H = (o) => (k) => o[k] ?? null;
ok(
  isPrefetch(H({ "sec-purpose": "prefetch" })) &&
    isPrefetch(H({ "sec-purpose": "prefetch;prerender" })) &&
    isPrefetch(H({ purpose: "prefetch" })) &&
    isPrefetch(H({ "x-moz": "prefetch" })),
  "prefetch headers",
);
ok(!isPrefetch(H({})) && !isPrefetch(H({ "sec-fetch-mode": "cors" })), "normal request");

// ---------- شناسه ----------
{
  const a = newGuestId();
  const b = newGuestId();
  ok(validGuestId(a) && validGuestId(b) && a !== b && a.length === 22, `random 22-char id (${a})`);
  ok(!validGuestId("") && !validGuestId(null) && !validGuestId("short") && !validGuestId("a".repeat(21) + "!") && !validGuestId("x' or 1=1--aaaaaaaaaaa"), "invalid ids rejected");
}

// ---------- محدودیت سرعت ----------
{
  let t = 0;
  const L = new MinuteLimiter(3, () => t);
  ok([1, 2, 3].every(() => L.hit("g")) && !L.hit("g"), "4th hit in the minute blocked");
  ok(L.hit("other"), "other key independent");
  t = 60_000;
  ok(L.hit("g"), "new minute → allowed again");
  // CGNAT: ۶۰۰ مهمان مختلف پشت یک IP، هر کدام یک بازدید ← همه مجاز (محدودیت قدیمی ۶۰ همه را بعد از ۶۰ می‌بست)
  let ti = 0;
  const ip = new MinuteLimiter(IP_PER_MINUTE, () => ti);
  const guest = new MinuteLimiter(GUEST_PER_MINUTE, () => ti);
  let allowed = 0;
  for (let i = 0; i < 600; i++) if (ip.hit("5.120.0.1") && guest.hit(`g${i}`)) allowed++;
  ok(allowed === 600, `600 guests behind one mobile IP all counted (${allowed})`);
  ok(!ip.hit("5.120.0.1"), "601st request from the same IP in a minute blocked (attack)");
  // یک مهمان پرتکرار: بعد از ۳۰ در دقیقه بسته
  const g2 = new MinuteLimiter(GUEST_PER_MINUTE, () => ti);
  let a2 = 0;
  for (let i = 0; i < 50; i++) if (g2.hit("same")) a2++;
  ok(a2 === GUEST_PER_MINUTE && GUEST_PER_MINUTE === 30 && IP_PER_MINUTE === 600, `one guest limited to ${GUEST_PER_MINUTE}/min (${a2})`);
  // حافظه محدود: بعد از پر شدن، پنجره‌های تمام‌شده پاک می‌شوند
  let tm = 0;
  const M = new MinuteLimiter(5, () => tm, 3);
  ["a", "b", "c"].forEach((k) => M.hit(k));
  ok(!M.hit("d"), "map full → new key refused until windows expire");
  tm = 61_000;
  ok(M.hit("d"), "expired windows cleaned");
}

// ---------- ثابت‌ها (تصمیم‌های مالک) ----------
ok(
  GUEST_VIEW_DEDUPE_MS === 30 * 60 * 1000 && GUEST_RETENTION_DAYS === 180 && GUEST_MERGE_DAYS === 90 && GUEST_DAILY_EVENT_CAP === 200,
  "dedupe 30 min, retention 180 days, merge 90 days, cap 200/day",
);

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
