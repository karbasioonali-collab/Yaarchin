import "server-only";
// داده‌ی کارت‌های داشبورد (بخش ۵۱). همه داخل Postgres؛ شمارش‌های سنگین (کل زمان، ۷ روز) ۶۰ ثانیه در حافظه کش می‌شوند.
// «روز» = روز تهران (src/lib/tehran-time.ts). هر شمارش رویداد با type فیلتر می‌شود (customer_signal هرگز حساب نمی‌شود).
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { aiReady, aiTestsReady, chatReady, ratesReady, reportsReady } from "@/lib/db-ready";
import { scoreSource } from "@/lib/leads/score";
import { addDays, tehranDayStart, tehranYmd } from "@/lib/tehran-time";
import { TtlCache } from "./core";

// DASHBOARD_CACHE_MS فقط برای تست e2e (۰ = بدون کش)؛ پیش‌فرض ۶۰ ثانیه
const ttl = Number(process.env.DASHBOARD_CACHE_MS);
const cache = new TtlCache(process.env.DASHBOARD_CACHE_MS !== undefined && Number.isFinite(ttl) && ttl >= 0 ? ttl : 60_000);
const n = (v: unknown) => Number(v ?? 0);
const days7 = (today: string) => Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

// جواب واقعی به مشتری: پیام متنی کارشناس، یا دستیار (دیده‌شده برای مشتری، نه پیام «به کارشناس سپردم»).
// پیام خودکار خوش‌آمد (system) و پیام‌های حالت آزمایشی (visible_to_customer = false) جواب نیستند. جواب قیمت با کد (بخش ۴۶) جواب دستیار است.
const AI_REPLY = sql`(r.sender_type = 'ai' and r.kind = 'text' and r.visible_to_customer and coalesce(r.meta->>'source', '') <> 'handoff')`;
const STAFF_REPLY = sql`(r.sender_type = 'staff' and r.kind = 'text')`;

// ---------- بازدید سایت ----------
// «ورود به سایت» (site_visit؛ هر نفر روزی یک بار). مهمان = user_id خالی و anon_id پر؛ مشتری = بقیه.
export type VisitsCard = {
  all: { total: number; guest: number };
  last24: { total: number; guest: number };
  days: { ymd: string; total: number; guest: number }[];
  guestSince: Date | null;
};
export async function visitsCard(): Promise<VisitsCard> {
  const today = tehranYmd();
  return cache.get(`visits:${today}`, async () => {
    const start7 = tehranDayStart(addDays(today, -6));
    const [a, d] = await Promise.all([
      db.execute<Record<string, string | Date | null>>(sql`
        select count(*) as total, count(*) filter (where user_id is null and anon_id is not null) as guest,
          count(*) filter (where occurred_at >= now() - interval '24 hours') as t24,
          count(*) filter (where occurred_at >= now() - interval '24 hours' and user_id is null and anon_id is not null) as g24,
          (select min(occurred_at) from events where anon_id is not null) as since
        from events where type = 'site_visit'`),
      db.execute<{ ymd: string; total: string; guest: string }>(sql`
        select to_char((occurred_at at time zone 'Asia/Tehran')::date, 'YYYY-MM-DD') as ymd, count(*) as total,
          count(*) filter (where user_id is null and anon_id is not null) as guest
        from events where type = 'site_visit' and occurred_at >= ${start7} group by 1`),
    ]);
    const x = a.rows[0] ?? {};
    const by = new Map(d.rows.map((r) => [r.ymd, r]));
    return {
      all: { total: n(x.total), guest: n(x.guest) },
      last24: { total: n(x.t24), guest: n(x.g24) },
      days: days7(today).map((ymd) => ({ ymd, total: n(by.get(ymd)?.total), guest: n(by.get(ymd)?.guest) })),
      guestSince: x.since ? new Date(x.since as Date) : null,
    };
  });
}

// ---------- گفتگوها ----------
// دیروز (تصمیم مالک؛ docs بخش ۵۱):
//   کل = گفتگوهایی که مشتری دیروز دست‌کم یک پیام متنی در آن‌ها فرستاد
//   پاسخ دستیار / پاسخ کارشناس = از همان‌ها، با دست‌کم یک جواب واقعی از دستیار / کارشناس بعد از اولین پیام دیروزِ مشتری و تا پایان دیروز
//     (یک گفتگو می‌تواند در هر دو باشد؛ پس جمع این دو ممکن است از «کل» بیشتر شود)
//   بی‌پاسخ = بعد از آخرین پیام دیروزِ مشتری تا پایان دیروز هیچ جواب واقعی نیامد (جواب امروز حساب نمی‌شود تا عدد دیروز ثابت بماند)
export type ChatsDay = { total: number; ai: number; staff: number; unanswered: number };
const chatDaySql = (start: Date, end: Date): SQL => sql`
  with c as (
    select conversation_id, min(created_at) as first_c, max(created_at) as last_c from chat_messages
    where sender_type = 'customer' and kind = 'text' and created_at >= ${start} and created_at < ${end} group by conversation_id)
  select count(*) as total,
    count(*) filter (where exists (select 1 from chat_messages r where r.conversation_id = c.conversation_id and ${AI_REPLY} and r.created_at > c.first_c and r.created_at < ${end})) as ai,
    count(*) filter (where exists (select 1 from chat_messages r where r.conversation_id = c.conversation_id and ${STAFF_REPLY} and r.created_at > c.first_c and r.created_at < ${end})) as staff,
    count(*) filter (where not exists (select 1 from chat_messages r where r.conversation_id = c.conversation_id and (${AI_REPLY} or ${STAFF_REPLY}) and r.created_at > c.last_c and r.created_at < ${end})) as unanswered
  from c`;

export async function chatsYesterday(): Promise<{ day: ChatsDay; days: { ymd: string; total: number }[] } | null> {
  if (!(await chatReady())) return null;
  const today = tehranYmd();
  return cache.get(`chats:${today}`, async () => {
    const y = addDays(today, -1);
    const [d, w] = await Promise.all([
      db.execute<Record<string, string>>(chatDaySql(tehranDayStart(y), tehranDayStart(today))),
      db.execute<{ ymd: string; total: string }>(sql`
        select to_char((created_at at time zone 'Asia/Tehran')::date, 'YYYY-MM-DD') as ymd, count(distinct conversation_id) as total
        from chat_messages where sender_type = 'customer' and kind = 'text' and created_at >= ${tehranDayStart(addDays(today, -6))} group by 1`),
    ]);
    const x = d.rows[0] ?? {};
    const by = new Map(w.rows.map((r) => [r.ymd, n(r.total)]));
    return {
      day: { total: n(x.total), ai: n(x.ai), staff: n(x.staff), unanswered: n(x.unanswered) },
      days: days7(today).map((ymd) => ({ ymd, total: by.get(ymd) ?? 0 })),
    };
  });
}

// الان: گفتگوی باز که بعد از آخرین پیام مشتری جواب واقعی نگرفته (گفتگوی سپرده‌شده به کارشناس که هنوز کارشناس جواب نداده هم هست).
// بدون کش (باید تازه باشد)؛ قدیمی‌ترین اول.
export type Waiting = { id: string; customer: string; since: Date; assignee: string | null; handedOff: boolean };
export async function chatsWaiting(limit = 8): Promise<{ list: Waiting[]; count: number } | null> {
  if (!(await chatReady())) return null;
  const base = sql`from conversations c join users u on u.id = c.customer_id left join users a on a.id = c.assigned_to
    where c.status = 'open' and c.last_customer_message_at is not null
      and not exists (select 1 from chat_messages r where r.conversation_id = c.id and (${AI_REPLY} or ${STAFF_REPLY}) and r.created_at > c.last_customer_message_at)`;
  const [l, k] = await Promise.all([
    db.execute<{ id: string; customer: string; since: Date; assignee: string | null; attention: string | null }>(
      sql`select c.id, u.full_name as customer, c.last_customer_message_at as since, a.full_name as assignee, c.attention ${base} order by c.last_customer_message_at asc limit ${limit}`,
    ),
    db.execute<{ n: string }>(sql`select count(*) as n ${base}`),
  ]);
  return {
    list: l.rows.map((r) => ({ id: r.id, customer: r.customer, since: new Date(r.since), assignee: r.assignee, handedOff: r.attention === "needs_expert" })),
    count: n(k.rows[0]?.n),
  };
}

// ---------- مشتری‌ها ----------
const isCustomer = sql`exists (select 1 from user_roles ur join roles ro on ro.id = ur.role_id where ur.user_id = u.id and ro.key = 'customer')`;
export async function newCustomersCard(): Promise<{ yesterday: number; today: number }> {
  const today = tehranYmd();
  const r = await db.execute<{ y: string; t: string }>(sql`
    select count(*) filter (where u.created_at < ${tehranDayStart(today)}) as y, count(*) filter (where u.created_at >= ${tehranDayStart(today)}) as t
    from users u where u.created_at >= ${tehranDayStart(addDays(today, -1))} and ${isCustomer}`);
  return { yesterday: n(r.rows[0]?.y), today: n(r.rows[0]?.t) };
}

// ۵ مشتری با بیشترین امتیاز جدیت که در ۲۴ ساعت گذشته سایت را دیده‌اند (ورود، محصول یا دسته)
export async function activeLeads(limit = 5): Promise<{ id: string; name: string; score: number; lastAt: Date }[] | null> {
  if (!(await reportsReady())) return null;
  const { sql: src } = await scoreSource();
  const r = await db.execute<{ id: string; name: string; score: string; last_at: Date }>(sql`
    select u.id, u.full_name as name, s.score, x.last_at from ${src} s
    join users u on u.id = s.user_id
    join lateral (select max(occurred_at) as last_at from events e where e.user_id = s.user_id and e.type in ('site_visit', 'product_view', 'category_view')
                  and e.occurred_at >= now() - interval '24 hours') x on x.last_at is not null
    where s.score > 0 order by s.score desc, x.last_at desc limit ${limit}`);
  return r.rows.map((x) => ({ id: x.id, name: x.name, score: Math.round(Number(x.score)), lastAt: new Date(x.last_at) }));
}

// ---------- نرخ ارز ----------
// نرخ بازار امروز و دیروز هر ارز فعال (غیر از تومان). آخرین نرخ ثبت‌شده هر روز همان روز.
// prev (بخش ۵۳): آخرین نرخ ثبت‌شده‌ی قبل از امروز (هر تاریخی) با تاریخش؛ وقتی امروز یا دیروز نرخ ندارد، به‌جای «—» نشان داده می‌شود
export type RateCard = {
  code: string;
  nameFa: string;
  today: number | null;
  yesterday: number | null;
  lastDate: string | null;
  prev: { rate: number; date: string } | null;
};
export async function ratesCard(): Promise<RateCard[] | null> {
  if (!(await ratesReady())) return null;
  const today = tehranYmd();
  const y = addDays(today, -1);
  const r = await db.execute<{ code: string; name_fa: string; t: string | null; y: string | null; last_date: string | null; p_rate: string | null; p_date: string | null }>(sql`
    select c.code, c.name_fa,
      (select rate_toman from exchange_rates e where e.currency_code = c.code and e.kind = 'market' and e.rate_date = ${today}::date order by created_at desc, id desc limit 1) as t,
      (select rate_toman from exchange_rates e where e.currency_code = c.code and e.kind = 'market' and e.rate_date = ${y}::date order by created_at desc, id desc limit 1) as y,
      (select to_char(max(rate_date), 'YYYY-MM-DD') from exchange_rates e where e.currency_code = c.code and e.kind = 'market') as last_date,
      p.rate_toman as p_rate, to_char(p.rate_date, 'YYYY-MM-DD') as p_date
    from currencies c
    left join lateral (select rate_toman, rate_date from exchange_rates e where e.currency_code = c.code and e.kind = 'market' and e.rate_date < ${today}::date
                       order by rate_date desc, created_at desc, id desc limit 1) p on true
    where c.is_active and not c.is_base order by c.sort_order, c.code`);
  return r.rows.map((x) => ({
    code: x.code,
    nameFa: x.name_fa,
    today: x.t === null ? null : Number(x.t),
    yesterday: x.y === null ? null : Number(x.y),
    lastDate: x.last_date,
    prev: x.p_rate !== null && x.p_date ? { rate: Number(x.p_rate), date: x.p_date } : null,
  }));
}

// ---------- هزینه‌ی هوش مصنوعی ----------
// فقط درخواست‌های زنده (حالت آزمایشی هزینه ندارد)؛ همه‌ی کاربردها (چت، آزمون، متن محصول، تحلیل، تست اتصال)
export async function aiCostCard(): Promise<{ yesterday: number; today: number; all: number } | null> {
  if (!(await aiReady())) return null;
  const today = tehranYmd();
  return cache.get(`aicost:${today}`, async () => {
    const r = await db.execute<{ y: string; t: string; a: string }>(sql`
      select coalesce(sum(cost_toman) filter (where created_at >= ${tehranDayStart(addDays(today, -1))} and created_at < ${tehranDayStart(today)}), 0) as y,
        coalesce(sum(cost_toman) filter (where created_at >= ${tehranDayStart(today)}), 0) as t,
        coalesce(sum(cost_toman), 0) as a
      from ai_requests where mode = 'live'`);
    return { yesterday: n(r.rows[0]?.y), today: n(r.rows[0]?.t), all: n(r.rows[0]?.a) };
  });
}

// ---------- آزمون دستیار ----------
// آخرین آزمون کامل (scope.kind = all) که تمام شد. «مدل یا دستورالعمل عوض شده» از staleWarning (lib/ai/tests.ts) می‌آید.
export async function lastFullTest() {
  if (!(await aiTestsReady())) return null;
  const r = await db.execute<{ started_at: Date; finished_at: Date | null; total: number; passed: number; failed: number; mode: string }>(sql`
    select started_at, finished_at, total, passed, failed, mode from ai_test_runs
    where status = 'done' and scope->>'kind' = 'all' order by started_at desc limit 1`);
  const active = await db.execute<{ n: string }>(sql`select count(*) as n from ai_test_cases where status = 'active'`);
  const x = r.rows[0];
  return {
    activeCases: n(active.rows[0]?.n),
    last: x ? { at: new Date(x.finished_at ?? x.started_at), startedAt: new Date(x.started_at), total: n(x.total), passed: n(x.passed), failed: n(x.failed), mode: x.mode } : null,
  };
}
