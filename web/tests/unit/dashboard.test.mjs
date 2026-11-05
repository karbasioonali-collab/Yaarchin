// تست واحد بخش ۵۱: بخش خالص داشبورد (نمودار، رنگ انتظار، موعد آزمون، زمان و بازه‌ی تحلیل خودکار، «چقدر مانده»، کش).
import { readFileSync } from "node:fs";
import {
  autoInsightDue,
  autoInsightHour,
  autoInsightRange,
  insightMissing,
  nextTestDue,
  sparkPath,
  tehranHour,
  TtlCache,
  waitText,
  waitTone,
} from "../../src/lib/dashboard/core.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};

// ---------- نمودار ----------
const s = sparkPath([0, 5, 10], 120, 32, 3);
ok(s.points.length === 3 && s.points[0].x === 3 && s.points[2].x === 117, "x from left to right with padding");
ok(s.points[2].y === 3 && s.points[0].y === 29 && s.points[1].y === 16, "max at top, zero at bottom");
ok(s.line === "3,29 60,16 117,3" && s.area.startsWith("M3,29 ") && s.area.endsWith(" L117,29 Z"), "polyline and closed area");
ok(
  sparkPath([0, 0, 0]).points.every((p) => p.y === 29),
  "all zero → flat bottom line (no NaN)",
);
ok(sparkPath([]).line === "" && sparkPath([4]).points[0].x === 3, "empty and single value safe");

// ---------- انتظار ----------
const now = new Date("2026-11-05T10:00:00Z");
ok(waitTone(new Date(now.getTime() - 119 * 60000), now) === "wait" && waitTone(new Date(now.getTime() - 121 * 60000), now) === "late", "orange up to 2h, red after");
ok(
  waitText(new Date(now.getTime() - 5 * 60000), now) === "۵ دقیقه" &&
    waitText(new Date(now.getTime() - 3 * 3600000), now) === "۳ ساعت" &&
    waitText(new Date(now.getTime() - 50 * 3600000), now) === "۲ روز",
  "wait text",
);

// ---------- آزمون بعدی ----------
ok(nextTestDue(null, 14, false, now).kind === "now" && nextTestDue(null, 14, false, now).reason === "never", "never run → now");
const last = new Date(now.getTime() - 3 * 86400000);
const due = nextTestDue(last, 14, false, now);
ok(due.kind === "due" && due.at.getTime() === last.getTime() + 14 * 86400000, "due = last full test + stale days");
ok(nextTestDue(last, 14, true, now).reason === "changed", "model/prompt changed → now");
ok(nextTestDue(last, 2, false, now).reason === "overdue", "past due → now (overdue)");

// ---------- تحلیل خودکار ----------
ok(tehranHour(new Date("2026-11-05T02:29:00Z")) === 5 && tehranHour(new Date("2026-11-05T02:31:00Z")) === 6, "Tehran hour (+03:30)");
ok(!autoInsightDue(new Date("2026-11-05T02:29:00Z"), 6) && autoInsightDue(new Date("2026-11-05T02:31:00Z"), 6), "after 06:00 Tehran only");
ok(
  autoInsightHour(undefined) === 6 && autoInsightHour("0") === 0 && autoInsightHour("24") === 6 && autoInsightHour("x") === 6 && autoInsightHour("") === 6,
  "AUTO_INSIGHT_HOUR override (test only)",
);
const ar = autoInsightRange(new Date("2026-11-05T10:00:00Z"));
ok(ar.from === "2026-10-29" && ar.to === "2026-11-04" && ar.days === 7, `7 days up to the end of yesterday (${ar.from}..${ar.to})`);
const ar2 = autoInsightRange(new Date("2026-11-04T21:00:00Z")); // ۰۰:۳۰ تهران روز ۵
ok(ar2.to === "2026-11-04", "Tehran day boundary, not UTC");

// ---------- «چقدر مانده» ----------
ok(insightMissing({ productViews: 12, newChats: 2 }, 5).join() === "۱۲ بازدید محصول از ۳۰ لازم (یا ۲ گفتگو از ۵)", "missing views");
ok(insightMissing({ productViews: 40, newChats: 0 }, 2).join() === "۲ روز با فعالیت از ۳ لازم", "missing days only");
ok(insightMissing({ productViews: 0, newChats: 5 }, 3).length === 0, "enough via chats");

// ---------- کش ----------
const c = new TtlCache(60000);
let loads = 0;
const load = async () => ++loads;
await c.get("k", load, 1000);
await c.get("k", load, 50000);
ok(loads === 1, "cached within 60 s");
await c.get("k", load, 61001);
ok(loads === 2, "reloaded after 60 s");
await c.get("other", load, 61001);
ok(loads === 3, "separate keys");

// ---------- seed و متن‌ها ----------
const seed = JSON.parse(readFileSync(new URL("../../src/db/seed-data.json", import.meta.url), "utf8"));
const st = seed.settings.find((x) => x.key === "ai.report_insights_auto");
ok(st && st.value === false && st.groupKey === "ai", "seed: auto insight switch, default off");
const sched = readFileSync(new URL("../../src/lib/chat/scheduler.ts", import.meta.url), "utf8");
ok(sched.includes("yc_auto_insight") && sched.includes("runAutoInsight"), "scheduler runs auto insight under its own lock");
const data = readFileSync(new URL("../../src/lib/dashboard/data.ts", import.meta.url), "utf8");
ok(data.includes("coalesce(r.meta->>'source', '') <> 'handoff'") && data.includes("r.visible_to_customer"), "assistant reply excludes hand-off and test messages");

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
