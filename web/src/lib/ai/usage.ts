import "server-only";
// سقف‌های دستیار (تنظیم‌های گروه ai) و مصرف امروز (روز تهران). docs/infoyaarchin.md بخش ۲۹.
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getSetting } from "@/lib/settings";
import { tehranDayStart, tehranYmd } from "@/lib/tehran-time";

export type AiLimits = {
  maxRepliesPerChat: number;
  customerDailyMessages: number;
  dailyRequests: number;
  dailyCostToman: number;
  bigOrderQty: number;
  leadScoreHandoff: number;
  resumeAfterHours: number;
};

const int = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : def;
};

export async function aiLimits(): Promise<AiLimits> {
  const g = (k: string) => getSetting(k).catch(() => null);
  const [a, b, c, d, e, f, h] = await Promise.all(
    ["ai.max_replies_per_chat", "ai.customer_daily_messages", "ai.daily_requests", "ai.daily_cost_toman", "ai.big_order_qty", "ai.lead_score_handoff", "ai.resume_after_hours"].map(
      g,
    ),
  );
  return {
    maxRepliesPerChat: int(a, 12, 1, 200),
    customerDailyMessages: int(b, 40, 1, 2000),
    dailyRequests: int(c, 1500, 1, 1_000_000),
    dailyCostToman: int(d, 50000, 0, 1_000_000_000),
    bigOrderQty: int(e, 5000, 1, 100_000_000),
    leadScoreHandoff: int(f, 80, 1, 100000),
    resumeAfterHours: int(h, 24, 0, 24 * 365),
  };
}

// مصرف امروز (فقط درخواست‌های زنده؛ حالت آزمایشی هزینه ندارد). دو سقف جدا (بخش ۳۳):
//   chat ← فقط purpose = chat (جواب به مشتری؛ سقف ai.daily_requests و ai.daily_cost_toman)
//   test ← آزمون دستیار و «پیشنهاد سؤال فریبنده با AI» (purpose = test_run | suggest؛ سقف ai.test_daily_cost_toman)
// تست اتصال در هیچ‌کدام حساب نمی‌شود (چند ده تومان). پس آزمون هیچ‌وقت جواب دادن به مشتری را متوقف نمی‌کند.
export async function todayUsage(scope: "chat" | "test" = "chat"): Promise<{ requests: number; costToman: number; promptTokens: number; completionTokens: number }> {
  const start = tehranDayStart(tehranYmd());
  const purpose = scope === "chat" ? sql`purpose = 'chat'` : sql`purpose in ('test_run', 'suggest')`;
  const r = await db.execute<{ n: string; cost: string; pt: string; ct: string }>(sql`
    select count(*) filter (where model is not null) as n, coalesce(sum(cost_toman), 0) as cost, coalesce(sum(prompt_tokens), 0) as pt, coalesce(sum(completion_tokens), 0) as ct
    from ai_requests where mode = 'live' and ${purpose} and created_at >= ${start}`);
  const x = r.rows[0];
  return { requests: Number(x?.n ?? 0), costToman: Number(x?.cost ?? 0), promptTokens: Number(x?.pt ?? 0), completionTokens: Number(x?.ct ?? 0) };
}

// سقف روزانه‌ی آزمون و بازه‌ی هشدار «آزمون کامل اجرا نشده»
export async function testLimits(): Promise<{ dailyCostToman: number; staleDays: number }> {
  const [a, b] = await Promise.all([getSetting("ai.test_daily_cost_toman").catch(() => null), getSetting("ai.test_stale_days").catch(() => null)]);
  return { dailyCostToman: int(a, 50000, 0, 1_000_000_000), staleDays: int(b, 14, 1, 3650) };
}

// میانگین هزینه‌ی ۳۰ درخواست زنده‌ی اخیر که به مدل رفتند (چت یا آزمون)؛ null = هنوز نیست
export async function avgModelCost(): Promise<number | null> {
  const r = await db.execute<{ avg: string | null; n: string }>(sql`
    select avg(cost_toman) as avg, count(*) as n from (
      select cost_toman from ai_requests where mode = 'live' and purpose in ('chat', 'test_run') and model is not null and cost_toman > 0
      order by id desc limit 30) x`);
  const x = r.rows[0];
  return x && Number(x.n) > 0 && x.avg !== null ? Number(x.avg) : null;
}

// هشدار پنل وقتی ۸۰٪ سقف هزینه‌ی روزانه مصرف شده (null = زیر ۸۰٪ یا سقف صفر)
export async function costWarning(): Promise<{ pct: number; cost: number; cap: number } | null> {
  const [l, u] = await Promise.all([aiLimits(), todayUsage()]);
  if (!l.dailyCostToman) return null;
  const pct = Math.round((u.costToman / l.dailyCostToman) * 100);
  return pct >= 80 ? { pct, cost: u.costToman, cap: l.dailyCostToman } : null;
}

// پیام‌های مشتری به دستیار در ۲۴ ساعت اخیر (درخواست‌های گفتگو، زنده یا آزمایشی؛ جواب‌های آماده‌ی احوال‌پرسی حساب نمی‌شوند)
export async function customerMessages24h(customerId: string): Promise<number> {
  const r = await db.execute<{ n: string }>(sql`
    select count(*) as n from ai_requests r join conversations c on c.id = r.conversation_id
    where r.purpose = 'chat' and r.outcome is distinct from 'pleasantry' and c.customer_id = ${customerId} and r.created_at > now() - interval '24 hours'`);
  return Number(r.rows[0]?.n ?? 0);
}
