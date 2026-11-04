import "server-only";
// ذخیره‌ی «نشانه‌ها از گفتگو» (بخش ۴۳). منطق خالص در signals.ts است.
//   customer_signals: آخرین مقدار هر کلید (برای امتیاز جدیت؛ PK user_id+key)
//   events (type = customer_signal): تاریخچه با تاریخ و جمله‌ی مشتری. هیچ شمارش بازدید یا گزارشی این نوع را حساب نمی‌کند
//   (همه با type فیلتر می‌شوند؛ INTERNAL_EVENT_TYPES در lib/customer/events.ts).
// فقط مشتری واقعی: تعداد با کد از API چت مشتری؛ نشانه‌های مدل فقط در دستیار زنده (نه حالت آزمایشی و نه آزمون دستیار).
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { customerSignals, events } from "@/db/schema";
import { ratesReady, reportsReady } from "@/lib/db-ready";
import { SIGNAL_KEYS, type Signal, type SignalKey } from "./signals";

export const SIGNAL_EVENT = "customer_signal";

export type SignalEventProps = {
  key: SignalKey;
  valueNum: number | null;
  valueText: string;
  quote: string;
  messageId: number;
  conversationId: string;
  via: "code" | "ai";
  confidence: number;
  priceQuestion?: boolean;
  clarifyAsked?: boolean;
};

export async function recordSignals(o: {
  userId: string;
  conversationId: string;
  messageId: number;
  quote: string;
  signals: (Signal & { clarifyAsked?: boolean })[];
}): Promise<void> {
  if (!o.signals.length || !(await reportsReady())) return;
  const quote = o.quote.trim().slice(0, 500);
  for (const s of o.signals) {
    const row = {
      userId: o.userId,
      key: s.key,
      valueNum: s.valueNum === null ? null : String(s.valueNum),
      valueText: s.valueText,
      source: s.via === "code" ? "chat_code" : "ai",
      confidence: String(s.confidence),
      note: quote.slice(0, 300),
    };
    await db
      .insert(customerSignals)
      .values(row)
      .onConflictDoUpdate({ target: [customerSignals.userId, customerSignals.key], set: { ...row, updatedAt: new Date() } });
    // بودجه‌ی روشن جای بودجه‌ی مبهم را می‌گیرد
    if (s.key === "budget_mtoman") await db.delete(customerSignals).where(and(eq(customerSignals.userId, o.userId), eq(customerSignals.key, "budget_unclear")));
    const props: SignalEventProps = {
      key: s.key,
      valueNum: s.valueNum,
      valueText: s.valueText,
      quote,
      messageId: o.messageId,
      conversationId: o.conversationId,
      via: s.via,
      confidence: s.confidence,
      ...(s.priceQuestion ? { priceQuestion: true } : {}),
      ...(s.clarifyAsked ? { clarifyAsked: true } : {}),
    };
    await db.insert(events).values({ userId: o.userId, type: SIGNAL_EVENT, entityType: "conversation", entityId: o.conversationId, props });
  }
}

// سؤال «منظورتان از ۲۰۰ تومان…» در این گفتگو قبلاً پرسیده شده؟ (فقط یک بار در هر گفتگو)
export async function budgetClarifyAsked(conversationId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.type, SIGNAL_EVENT), eq(events.entityType, "conversation"), eq(events.entityId, conversationId), sql`${events.props}->>'clarifyAsked' = 'true'`))
    .limit(1);
  return !!r;
}

// نرخ بازار دلار و یوان (آخرین تا امروز تهران) برای تبدیل بودجه‌ی ارزی
export async function marketRates(): Promise<{ usd: number | null; cny: number | null }> {
  if (!(await ratesReady())) return { usd: null, cny: null };
  const r = await db.execute<{ code: string; rate: string }>(sql`
    select distinct on (currency_code) currency_code as code, rate_toman as rate
    from exchange_rates where kind = 'market' and currency_code in ('USD', 'CNY') and rate_date <= (now() at time zone 'Asia/Tehran')::date
    order by currency_code, rate_date desc, created_at desc, id desc`);
  const of = (c: string) => {
    const x = r.rows.find((y) => y.code === c);
    return x ? Number(x.rate) : null;
  };
  return { usd: of("USD"), cny: of("CNY") };
}

// برای صفحه‌ی مشتری: آخرین مقدار هر کلید + تاریخچه (جدیدترین اول)
export async function customerSignalsView(userId: string) {
  if (!(await reportsReady())) return { latest: [], history: [] };
  const latest = await db.select().from(customerSignals).where(eq(customerSignals.userId, userId));
  const order = new Map<string, number>(SIGNAL_KEYS.map((k, i) => [k, i]));
  latest.sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));
  const history = await db
    .select({ id: events.id, at: events.occurredAt, props: events.props })
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.type, SIGNAL_EVENT)))
    .orderBy(desc(events.occurredAt), desc(events.id))
    .limit(50);
  return { latest, history: history.map((h) => ({ id: h.id, at: h.at, ...(h.props as SignalEventProps) })) };
}
