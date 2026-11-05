// تست واحد بخش ۵۰: دسترسی‌های ریز (seed) و ستون‌های تازه‌ی فهرست مشتریان (متن آخرین نشانه، رنگ امتیاز).
import { readFileSync } from "node:fs";
import { scoreTone, SCORE_TONE_STYLE } from "../../src/lib/leads/score-tone.ts";
import { signalShort } from "../../src/lib/leads/signals.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};

// ---------- seed ----------
const seed = JSON.parse(readFileSync(new URL("../../src/db/seed-data.json", import.meta.url), "utf8"));
const P = new Map(seed.permissions.map((p) => [p.key, p]));
for (const [k, g] of [
  ["reports.visits", "reports"],
  ["reports.products", "reports"],
  ["reports.chats", "reports"],
  ["reports.customers", "reports"],
  ["reports.insight", "insight"],
  ["ai.costs", "ai_costs"],
])
  ok(P.get(k)?.groupKey === g && /[؀-ۿ]/.test(P.get(k).nameFa), `permission ${k} in group ${g} with Persian name`);
ok(seed.rolePermissions.admin === "*", "admin gets every permission");
ok(!JSON.stringify(seed.rolePermissions.expert).includes("reports.insight") && !JSON.stringify(seed.rolePermissions.expert).includes("ai.costs"), "insight and costs not given to expert");
const seedJs = readFileSync(new URL("../../scripts/seed.mjs", import.meta.url), "utf8");
ok(
  /seed\.grant_report_sections/.test(seedJs) && /'reports\.visits', 'reports\.products', 'reports\.chats', 'reports\.customers'/.test(seedJs) && !/'reports\.insight'\]/.test(seedJs),
  "one-time grant of the 4 section permissions only",
);
const rolesPage = readFileSync(new URL("../../src/app/admin/(panel)/roles/[id]/page.tsx", import.meta.url), "utf8");
ok(/insight: "تحلیل هوشمند"/.test(rolesPage) && /ai_costs: "هزینه‌ی هوش مصنوعی"/.test(rolesPage) && /reports: "گزارش‌ها"/.test(rolesPage), "Persian group names on the roles page");

// ---------- آخرین نشانه ----------
ok(signalShort("order_qty", "500", null) === "۵۰۰ عدد", "order qty");
ok(signalShort("budget_mtoman", "200.00", null) === "بودجه ۲۰۰ میلیون تومان", "budget");
ok(signalShort("budget_mtoman", "1.5", null) === "بودجه ۱٫۵ میلیون تومان", "decimal budget");
ok(signalShort("budget_unclear", null, "۲۰۰ تومان") === "بودجه: مبهم", "unclear budget");
ok(signalShort("import_experience", "1", "دارد") === "سابقه‌ی واردات: دارد" && signalShort("import_experience", "0", "ندارد") === "سابقه‌ی واردات: ندارد", "import experience");
ok(signalShort("sales_channel", "1", "فروش اینترنتی") === "کانال: فروش اینترنتی", "sales channel");
ok(signalShort("orders_count", "3", null) === "۳", "unknown key → value");

// ---------- رنگ امتیاز ----------
ok(scoreTone(0) === "low" && scoreTone(49.9) === "low" && scoreTone(50) === "mid" && scoreTone(79) === "mid" && scoreTone(80) === "high" && scoreTone(150) === "high", "tones: <50 gray, 50–79 orange, ≥80 green");
ok(SCORE_TONE_STYLE.high.color === "#2F7D5C" && SCORE_TONE_STYLE.mid.background.includes("255, 122, 0"), "brand green and orange");

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
