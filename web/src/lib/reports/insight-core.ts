// «تحلیل هوشمند» گزارش‌ها (بخش ۴۹): بخش خالص (بدون server-only تا تست واحد مستقیم اجرایش کند).
// ورودی مدل فقط عددهای همان صفحه است، همه با کاما و واحد صریح («1,234 product views»)؛ اسم کارخانه یا سایت هرگز.
import type { Counts } from "./report";

// داده‌ی کافی: دست‌کم ۳۰ بازدید محصول (مهمان + مشتری) یا ۵ گفتگوی تازه، و دست‌کم ۳ روز با فعالیت
export const MIN_PRODUCT_VIEWS = 30;
export const MIN_CHATS = 5;
export const MIN_ACTIVE_DAYS = 3;
export function enoughData(c: Pick<Counts, "productViews" | "newChats">, activeDays: number): boolean {
  return (c.productViews >= MIN_PRODUCT_VIEWS || c.newChats >= MIN_CHATS) && activeDays >= MIN_ACTIVE_DAYS;
}

export type InsightData = {
  range: { from: string; to: string; days: number };
  cur: Counts;
  prev: Counts;
  // پربازدیدها با تعداد گفتگو و درخواست مشتری درباره‌ی همان محصول در بازه
  topProducts: { title: string; views: number; visitors: number; chats: number; inquiries: number }[];
  topCategories: { name: string; views: number; visitors: number }[];
  chat: { unanswered: number; unassignedOpen: number };
  leads: { above50: number; top: number | null };
  ai: { autoReplyPct: number | null; referralPct: number | null; thumbsDown: number | null };
};

const f = (n: number, unit: string) => `${n.toLocaleString("en-US")} ${unit}`;
const pair = (cur: number, prev: number, unit: string) => ({ current: f(cur, unit), previous_period: f(prev, unit) });

// متن JSON برای مدل (عددها رشته‌ی آماده؛ مدل عدد خام بی‌جداکننده نمی‌بیند، بخش ۴۷)
export function insightInput(d: InsightData): string {
  const c = d.cur;
  const p = d.prev;
  return JSON.stringify({
    period: `${d.range.from} to ${d.range.to} (${d.range.days} days); previous_period = the same number of days before it`,
    product_views: {
      ...pair(c.productViews, p.productViews, "views"),
      of_which_guests: f(c.productViewsGuest, "views"),
      of_which_customers: f(c.productViews - c.productViewsGuest, "views"),
    },
    unique_visitors: {
      ...pair(c.visitors, p.visitors, "visitors"),
      of_which_guests: f(c.visitorsGuest, "visitors"),
      of_which_customers: f(c.visitors - c.visitorsGuest, "visitors"),
    },
    site_visits: pair(c.siteVisits, p.siteVisits, "visits"),
    signups: pair(c.signups, p.signups, "signups"),
    favorite_adds: pair(c.favoriteAdds, p.favoriteAdds, "favorites"),
    new_chats: pair(c.newChats, p.newChats, "chats"),
    customer_inquiries: pair(c.inquiries, p.inquiries, "inquiries"),
    chats_now: { unanswered: f(d.chat.unanswered, "chats"), open_unassigned: f(d.chat.unassignedOpen, "chats") },
    serious_customers: { score_50_or_more: f(d.leads.above50, "customers"), ...(d.leads.top !== null ? { highest_score: f(d.leads.top, "points") } : {}) },
    assistant: {
      ...(d.ai.autoReplyPct !== null ? { answered_by_assistant: `${d.ai.autoReplyPct}%` } : {}),
      ...(d.ai.referralPct !== null ? { handed_to_expert: `${d.ai.referralPct}%` } : {}),
      ...(d.ai.thumbsDown !== null ? { thumbs_down: f(d.ai.thumbsDown, "ratings") } : {}),
    },
    top_products: d.topProducts.map((x) => ({
      product: x.title,
      views: f(x.views, "views"),
      visitors: f(x.visitors, "visitors"),
      chats: f(x.chats, "chats"),
      inquiries: f(x.inquiries, "inquiries"),
    })),
    top_categories: d.topCategories.map((x) => ({ category: x.name, views: f(x.views, "views"), visitors: f(x.visitors, "visitors") })),
  });
}

export const INSIGHT_SYSTEM = `You are the report analyst of the Yarchin admin panel (a service importing goods from China to Iran). From the DATA only, write 3 to 5 short, practical suggestions for the Yarchin team in Persian.
Rules:
- Each suggestion on its own line starting with "- ", at most 30 words, plain text, no Markdown, no headings, nothing else before or after.
- Use only numbers that appear in DATA, copied exactly; do not calculate new numbers or percentages, do not guess causes as facts.
- Never mention factories, manufacturers, suppliers, shopping sites, other companies, links or phone numbers.
- Useful angles: guests vs customers, change against the previous period, products with many views but few chats or inquiries, unanswered chats, serious customers to follow up, assistant hand-offs.`;

// خط‌های پیشنهاد از جواب مدل: «- …»، «• …»، «۱. …» یا خط ساده؛ حداکثر ۵
export function insightLines(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) =>
      l
        .trim()
        .replace(/^([-*•–]|\d+[.)]|[۰-۹]+[.)])\s*/, "")
        .trim(),
    )
    .filter((l) => l.length >= 8 && !/^(source|handoff|signals)\s*[:：]/i.test(l))
    .slice(0, 5);
}
