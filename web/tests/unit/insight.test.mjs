// تست واحد بخش ۴۹: «تحلیل هوشمند» گزارش — آستانه‌ی داده‌ی کافی، ورودی مدل با کاما و واحد صریح، خواندن خط‌ها.
import { suspectNumbers } from "../../src/lib/ai/number-check.ts";
import { enoughData, INSIGHT_SYSTEM, insightInput, insightLines, MIN_ACTIVE_DAYS, MIN_CHATS, MIN_PRODUCT_VIEWS } from "../../src/lib/reports/insight-core.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};

// ---------- آستانه ----------
ok(MIN_PRODUCT_VIEWS === 30 && MIN_CHATS === 5 && MIN_ACTIVE_DAYS === 3, "threshold constants (owner-approved)");
ok(enoughData({ productViews: 30, newChats: 0 }, 3), "30 views, 3 days → enough");
ok(enoughData({ productViews: 0, newChats: 5 }, 3), "5 chats, 3 days → enough");
ok(!enoughData({ productViews: 29, newChats: 4 }, 10), "29 views and 4 chats → not enough");
ok(!enoughData({ productViews: 500, newChats: 50 }, 2), "only 2 active days → not enough");

// ---------- ورودی مدل ----------
const C = (o = {}) => ({
  productViews: 1234,
  productViewsGuest: 1000,
  visitors: 321,
  visitorsGuest: 300,
  siteVisits: 456,
  siteVisitsGuest: 400,
  signups: 7,
  favoriteAdds: 12,
  newChats: 15,
  inquiries: 3,
  ...o,
});
const data = {
  range: { from: "2026-10-30", to: "2026-11-05", days: 7 },
  cur: C(),
  prev: C({ productViews: 980, newChats: 9 }),
  topProducts: [{ title: "مخلوط‌کن قابل‌حمل", views: 2500, visitors: 1800, chats: 2, inquiries: 0 }],
  topCategories: [{ name: "لوازم آشپزخانه", views: 1500, visitors: 900 }],
  chat: { unanswered: 4, unassignedOpen: 2 },
  leads: { above50: 6, top: 92 },
  ai: { autoReplyPct: 61, referralPct: 22, thumbsDown: 3 },
};
const inp = insightInput(data);
const j = JSON.parse(inp);
ok(
  j.product_views.current === "1,234 views" &&
    j.product_views.previous_period === "980 views" &&
    j.product_views.of_which_guests === "1,000 views" &&
    j.product_views.of_which_customers === "234 views",
  `product views with comma + unit (${JSON.stringify(j.product_views)})`,
);
ok(j.unique_visitors.of_which_guests === "300 visitors" && j.unique_visitors.of_which_customers === "21 visitors", "visitors guest/customer");
ok(
  j.top_products[0].views === "2,500 views" && j.top_products[0].inquiries === "0 inquiries" && j.top_products[0].product === "مخلوط‌کن قابل‌حمل",
  "top products with chats and inquiries",
);
ok(
  j.serious_customers.score_50_or_more === "6 customers" && j.serious_customers.highest_score === "92 points" && j.assistant.answered_by_assistant === "61%",
  "leads and assistant",
);
ok(!/"\s*:\s*\d/.test(inp), "no raw bare numbers as JSON values (all strings with units)");
ok(!/factory|supplier|company|alibaba|1688/i.test(inp), "no supplier data in the input");
ok(/Never mention factories/.test(INSIGHT_SYSTEM) && /Use only numbers that appear in DATA/.test(INSIGHT_SYSTEM) && /3 to 5/.test(INSIGHT_SYSTEM), "system prompt rules");

// ---------- خط‌ها ----------
ok(
  JSON.stringify(
    insightLines("- اول پیشنهاد مفید است\n• دوم پیشنهاد مفید است\n1. سوم پیشنهاد مفید است\n۴) چهارم پیشنهاد مفید است\n\nپنجم پیشنهاد مفید است\n- ششم پیشنهاد مفید است"),
  ) === JSON.stringify(["اول پیشنهاد مفید است", "دوم پیشنهاد مفید است", "سوم پیشنهاد مفید است", "چهارم پیشنهاد مفید است", "پنجم پیشنهاد مفید است"]),
  "bullets stripped, max 5",
);
ok(insightLines("- کوتاه\nsource: general\n- این یکی به اندازه‌ی کافی بلند است").length === 1, "too short and header lines dropped");
// سنجش عدد روی یک خط با همان ورودی
ok(suspectNumbers("با این روند ماهی ۵۰ میلیون تومان فروش بیشتر خواهید داشت.", [inp]).length === 1, "invented money line flagged");
ok(suspectNumbers("۱٬۲۳۴ بازدید محصول ثبت شده و ۴ گفتگو بی‌پاسخ است.", [inp]).length === 0, "counts are not money/time → not flagged");

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
