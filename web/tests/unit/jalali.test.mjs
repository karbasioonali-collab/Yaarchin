// تست واحد تبدیل شمسی ↔ میلادی و مرز روزهای تهران. docs/infoyaarchin.md بخش ۲۸.
// اجرا (از پوشه‌ی web): npm run test:unit
import { toJalali, toGregorian, parseJalali, formatJalali, jalaliToIso, isoToJalali, isJalaliLeapYear, jalaliMonthLength } from "../../src/lib/jalali.ts";
import { tehranDayStart, tehranYmd, tehranRange, addDays, daysBetween } from "../../src/lib/tehran-time.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};
// ۱) همه‌ی روزهای ۱۳۹۰/۰۱/۰۱ تا ۱۴۲۰/۱۲/آخر: مقایسه با تقویم شمسی Intl و رفت‌وبرگشت
const intl = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" });
let t = Date.UTC(2011, 2, 21),
  checked = 0;
while (t < Date.UTC(2042, 2, 21)) {
  const d = new Date(t);
  const p = Object.fromEntries(intl.formatToParts(d).map((x) => [x.type, x.value]));
  const j = toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  if (j.jy !== Number(p.year) || j.jm !== Number(p.month) || j.jd !== Number(p.day))
    ok(false, `${d.toISOString().slice(0, 10)}: ${JSON.stringify(j)} vs Intl ${p.year}/${p.month}/${p.day}`);
  const g = toGregorian(j.jy, j.jm, j.jd);
  if (Date.UTC(g.gy, g.gm - 1, g.gd) !== t) ok(false, `roundtrip ${d.toISOString()}`);
  t += 86400000;
  checked++;
}
ok(checked > 11000, `checked ${checked} days`);
// ۲) اول سال، کبیسه
ok(jalaliToIso({ jy: 1405, jm: 1, jd: 1 }) === "2026-03-21", "1 Farvardin 1405 = 2026-03-21");
ok(jalaliToIso({ jy: 1404, jm: 1, jd: 1 }) === "2025-03-21", "1 Farvardin 1404 = 2025-03-21");
ok(isJalaliLeapYear(1403) && !isJalaliLeapYear(1404) && jalaliMonthLength(1403, 12) === 30 && jalaliMonthLength(1404, 12) === 29, "1403 leap (Esfand 30), 1404 not");
ok(jalaliToIso({ jy: 1403, jm: 12, jd: 30 }) === "2025-03-20", "30 Esfand 1403 = 2025-03-20");
ok(parseJalali("۱۴۰۴/۱۲/۳۰") === null, "30 Esfand 1404 invalid");
ok(JSON.stringify(isoToJalali("2026-10-07")) === JSON.stringify({ jy: 1405, jm: 7, jd: 15 }), "2026-10-07 = 1405/07/15");
// ۳) ورودی کاربر
for (const s of ["۱۴۰۵/۰۷/۱۵", "1405/7/15", "1405-07-15", " ۱۴۰۵.۷.۱۵ ", "١٤٠٥/٠٧/١٥"]) ok(jalaliToIso(parseJalali(s)) === "2026-10-07", `parse ${s}`);
for (const s of ["1405/13/01", "1405/07/32", "1405/7", "abc", "", "14050715", "1405/00/10"]) ok(parseJalali(s) === null, `reject ${s}`);
ok(formatJalali({ jy: 1405, jm: 7, jd: 5 }) === "۱۴۰۵/۰۷/۰۵", "format with Persian digits");
// ۴) نیمه‌شب تهران (+۰۳:۳۰): ۲۳:۵۹:۵۹ هنوز روز قبل، ۰۰:۰۰ روز بعد
ok(tehranYmd(new Date("2026-10-06T20:29:59Z")) === "2026-10-06", "23:59:59 Tehran still 2026-10-06");
ok(tehranYmd(new Date("2026-10-06T20:30:00Z")) === "2026-10-07", "00:00 Tehran = 2026-10-07");
ok(tehranDayStart("2026-10-07").toISOString() === "2026-10-06T20:30:00.000Z", "day start = 20:30Z previous UTC day");
ok(tehranDayStart("2026-03-21").toISOString() === "2026-03-20T20:30:00.000Z", "Nowruz 1405 start");
const r = tehranRange("2026-10-01", "2026-10-07");
ok(r.start.toISOString() === "2026-09-30T20:30:00.000Z" && r.end.toISOString() === "2026-10-07T20:30:00.000Z", "range [from 00:00, to+1 00:00)");
ok(addDays("2026-03-20", 1) === "2026-03-21" && addDays("2026-01-01", -1) === "2025-12-31" && daysBetween("2026-09-01", "2026-10-07") === 36, "addDays/daysBetween");
// تهران قبل از ۱۴۰۱ ساعت تابستانی داشت: ۱ تیر ۱۴۰۰ (۲۰۲۱-۰۶-۲۲) +۰۴:۳۰
ok(tehranDayStart("2021-06-22").toISOString() === "2021-06-21T19:30:00.000Z", "historic DST day start (+04:30)");
console.log(`${n} checks${fails ? `, ${fails} FAILED` : ", ALL PASSED"}`);
process.exitCode = fails ? 1 : 0;
