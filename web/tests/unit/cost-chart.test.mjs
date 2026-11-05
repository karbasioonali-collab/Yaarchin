// تست واحد بخش ۵۲: نمودار هزینه‌ی هوش مصنوعی (گروه کاربردها، مرز روز، هفته‌ی شنبه‌تاجمعه، ماه و سال شمسی، جمع‌ها، مقیاس).
import { bucketEnd, bucketLabel, bucketStart, bucketStarts, costChart, costGroup, monthTotal, niceMax, weekStart } from "../../src/lib/ai/cost-chart.ts";
import { isJalaliLeapYear } from "../../src/lib/jalali.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};

// ---------- گروه‌ها ----------
ok(
  [
    ["chat", "chat"],
    ["test_run", "tests"],
    ["suggest", "tests"],
    ["catalog_text", "catalog"],
    ["report_insight", "report"],
    ["connection_test", "connection"],
    ["extract", "other"],
    ["something_new", "other"],
  ].every(([p, g]) => costGroup(p) === g),
  "purpose → group (tests = test_run + suggest; unknown → other)",
);

// ---------- مرزها ----------
const T = "2026-11-05"; // ۱۴ آبان ۱۴۰۵، پنج‌شنبه
ok(
  weekStart(T) === "2026-10-31" && weekStart("2026-10-31") === "2026-10-31" && weekStart("2026-10-30") === "2026-10-24",
  "week starts Saturday (Friday belongs to the previous week)",
);
ok(bucketEnd("2026-10-31", "week") === "2026-11-06", "week ends Friday");
ok(bucketStart(T, "month") === "2026-10-23" && bucketEnd("2026-10-23", "month") === "2026-11-21", "Jalali month Aban 1405 = 2026-10-23..2026-11-21");
ok(bucketStart("2026-03-20", "year") === "2025-03-21" && bucketStart("2026-03-21", "year") === "2026-03-21", "Jalali year starts on Nowruz");
ok(
  bucketLabel("2026-10-23", "month") === "آبان ۱۴۰۵" && bucketLabel("2026-03-21", "year") === "۱۴۰۵" && bucketLabel(T, "day") === "۱۴ آبان",
  "labels (no thousands separator in years)",
);
const esfand = bucketEnd(bucketStart("2026-03-01", "month"), "month");
ok(esfand === "2026-03-20", `Esfand 1404 ends the day before Nowruz (${esfand}, leap ${isJalaliLeapYear(1404)})`);

// ---------- ستون‌ها ----------
const d = bucketStarts("day", T, null);
ok(d.length === 30 && d[29] === T && d[0] === "2026-10-07", "daily: 30 days ending today");
const w = bucketStarts("week", T, null);
ok(w.length === 12 && w[11] === "2026-10-31" && w[10] === "2026-10-24", "weekly: 12 weeks");
const m = bucketStarts("month", T, null);
ok(m.length === 12 && m[11] === "2026-10-23" && m[0] === bucketStart("2025-12-01", "month"), `monthly: 12 Jalali months (${m[0]}..${m[11]})`);
ok(m[5] === "2026-04-21", "month list crosses the Jalali new year (Ordibehesht 1405 = 2026-04-21)");
const y = bucketStarts("year", T, "2024-05-01");
ok(y.join() === "2024-03-20,2025-03-21,2026-03-21", `yearly: from the first data year (${y.join()})`);
ok(bucketStarts("year", T, null).length === 1, "yearly with no data: current year");

// ---------- جمع‌ها ----------
const rows = [
  { ymd: "2024-06-01", purpose: "chat", cost: 1000 },
  { ymd: "2026-10-22", purpose: "chat", cost: 300 }, // آخرین روز مهر
  { ymd: "2026-10-23", purpose: "chat", cost: 200 }, // اول آبان
  { ymd: "2026-10-23", purpose: "test_run", cost: 50 },
  { ymd: "2026-10-30", purpose: "suggest", cost: 25 },
  { ymd: T, purpose: "report_insight", cost: 400 },
  { ymd: T, purpose: "weird", cost: 5 },
];
const mc = costChart(rows, "month", T);
ok(mc.all === 1980, "all-time total");
ok(
  mc.bars[11].total === 680 && mc.bars[11].parts.chat === 200 && mc.bars[11].parts.tests === 75 && mc.bars[11].parts.report === 400 && mc.bars[11].parts.other === 5,
  "Aban stacked parts",
);
ok(mc.bars[10].total === 300, "Mehr = 300 (month boundary in Tehran days)");
ok(mc.windowTotal === 980, "12-month window excludes 2024");
const yc = costChart(rows, "year", T);
ok(yc.bars.length === 3 && yc.bars[0].total === 1000 && yc.windowTotal === yc.all, "yearly: all years, window = all-time");
const wc = costChart(rows, "week", T);
ok(wc.bars[11].total === 405 && wc.bars[10].total === 25 && wc.bars[9].total === 550, "weeks: Sat 31 Oct..Fri 6 Nov = 405; 24..30 Oct = 25; Fri 23 Oct in 17..23 Oct = 550");
ok(costChart(rows, "day", T).bars[29].total === 405 && costChart(rows, "day", T).windowTotal === 980, "daily window");
ok(costChart([{ ymd: "2026-11-06", purpose: "chat", cost: 9 }], "month", T).windowTotal === 0, "future days ignored in the window");
ok(monthTotal(rows, T) === 680, "this Jalali month (summary card)");
ok(niceMax(0) === 1 && niceMax(680) === 800 && niceMax(1200) === 1500 && niceMax(23000) === 25000 && niceMax(4999) === 5000 && niceMax(8001) === 10000, "nice axis max");

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
