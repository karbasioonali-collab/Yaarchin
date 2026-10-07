import "server-only";
// محاسبه‌های صفحه‌ی «گزارش‌ها». همه داخل Postgres (GROUP BY) و فقط نتیجه‌ی کوچک به برنامه می‌آید. docs/infoyaarchin.md بخش ۲۸.
// بازه = [start, end) به لحظه‌ی UTC که از روزهای تهران ساخته شده (src/lib/reports/range.ts).
// «بازدید» فقط برای مشتری واردشده ثبت می‌شود (جدول events)؛ مهمان‌ها شمرده نمی‌شوند (کار آینده، بخش ۲۸).
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { chatReady, followupReady } from "@/lib/db-ready";

export type Win = { start: Date; end: Date };
const inWin = (col: string, w: Win) => sql`${sql.raw(col)} >= ${w.start} and ${sql.raw(col)} < ${w.end}`;
const n = (v: unknown) => Number(v ?? 0);
const isCustomer = (col: string) => sql`exists (select 1 from user_roles ur join roles ro on ro.id = ur.role_id where ur.user_id = ${sql.raw(col)} and ro.key = 'customer')`;

// ---------- اعداد قابل مقایسه با بازه‌ی قبل ----------
export type Counts = { productViews: number; visitors: number; signups: number; favoriteAdds: number; newChats: number; inquiries: number };

export async function counts(w: Win): Promise<Counts> {
  const [chat, followup] = [await chatReady(), await followupReady()];
  const r = await db.execute<Record<string, string>>(sql`
    select
      (select count(*) from events where type = 'product_view' and ${inWin("occurred_at", w)}) as product_views,
      (select count(distinct user_id) from events where type in ('site_visit', 'product_view', 'category_view') and user_id is not null and ${inWin("occurred_at", w)}) as visitors,
      (select count(*) from users u where ${inWin("u.created_at", w)} and ${isCustomer("u.id")}) as signups,
      (select count(*) from events where type = 'favorite_add' and ${inWin("occurred_at", w)}) as favorite_adds,
      ${chat ? sql`(select count(*) from conversations where ${inWin("created_at", w)})` : sql`0`} as new_chats,
      ${followup ? sql`(select count(*) from inquiries where ${inWin("created_at", w)})` : sql`0`} as inquiries`);
  const x = r.rows[0];
  return {
    productViews: n(x.product_views),
    visitors: n(x.visitors),
    signups: n(x.signups),
    favoriteAdds: n(x.favorite_adds),
    newChats: n(x.new_chats),
    inquiries: n(x.inquiries),
  };
}

// ---------- بازدید ----------
export async function topProducts(w: Win, limit = 10) {
  const r = await db.execute<{ id: string; slug: string; title: string; views: string; visitors: string }>(sql`
    select p.id, p.slug, p.title_fa as title, count(*) as views, count(distinct e.user_id) as visitors
    from events e join products p on p.id::text = e.entity_id
    where e.type = 'product_view' and ${inWin("e.occurred_at", w)}
    group by p.id order by views desc, visitors desc limit ${limit}`);
  return r.rows.map((x) => ({ id: x.id, slug: x.slug, title: x.title, views: n(x.views), visitors: n(x.visitors) }));
}

export async function topCategories(w: Win, limit = 10) {
  const r = await db.execute<{ id: string; slug: string; name: string; views: string; visitors: string }>(sql`
    select c.id, c.slug, c.name_fa as name, count(*) as views, count(distinct e.user_id) as visitors
    from events e join categories c on c.id::text = e.entity_id
    where e.type = 'category_view' and ${inWin("e.occurred_at", w)}
    group by c.id order by views desc, visitors desc limit ${limit}`);
  return r.rows.map((x) => ({ id: x.id, slug: x.slug, name: x.name, views: n(x.views), visitors: n(x.visitors) }));
}

// ---------- مشتری‌ها و علاقه‌مندی ----------
export async function newCustomers(w: Win, limit = 50) {
  const r = await db.execute<{ id: string; full_name: string; mobile: string | null; email: string | null; created_at: Date }>(sql`
    select u.id, u.full_name, u.mobile, u.email, u.created_at from users u
    where ${inWin("u.created_at", w)} and ${isCustomer("u.id")} order by u.created_at desc limit ${limit}`);
  return r.rows;
}

export async function topFavorited(w: Win, limit = 10) {
  const r = await db.execute<{ id: string; slug: string; title: string; adds: string }>(sql`
    select p.id, p.slug, p.title_fa as title, count(*) as adds
    from events e join products p on p.id::text = e.entity_id
    where e.type = 'favorite_add' and ${inWin("e.occurred_at", w)}
    group by p.id order by adds desc limit ${limit}`);
  return r.rows.map((x) => ({ id: x.id, slug: x.slug, title: x.title, adds: n(x.adds) }));
}

// ---------- گفتگوها (وضعیت «الان»؛ به بازه بستگی ندارد) ----------
// بی‌پاسخ = گفتگوی باز که آخرین پیام متنیِ آن از مشتری است و بعدش پاسخ کارشناس یا AI نیامده
export async function chatNow(limit = 30) {
  if (!(await chatReady())) return { unanswered: [], unansweredCount: 0, unassigned: 0 };
  const base = sql`from conversations c join users u on u.id = c.customer_id left join users a on a.id = c.assigned_to
    where c.status = 'open' and c.last_customer_message_at is not null
      and not exists (select 1 from chat_messages m where m.conversation_id = c.id and m.sender_type in ('staff', 'ai') and m.kind = 'text'
                      and m.created_at > c.last_customer_message_at)`;
  const [list, cnt, un] = await Promise.all([
    db.execute<{ id: string; customer: string; since: Date; assignee: string | null }>(
      sql`select c.id, u.full_name as customer, c.last_customer_message_at as since, a.full_name as assignee ${base} order by c.last_customer_message_at asc limit ${limit}`,
    ),
    db.execute<{ n: string }>(sql`select count(*) as n ${base}`),
    db.execute<{ n: string }>(sql`select count(*) as n from conversations where status = 'open' and assigned_to is null`),
  ]);
  return { unanswered: list.rows, unansweredCount: n(cnt.rows[0]?.n), unassigned: n(un.rows[0]?.n) };
}

// ---------- عملکرد کارشناس‌ها ----------
// ارجاع‌گرفته: رویداد ارجاع (meta.event = assign، meta.to) در بازه. پاسخ: پیام متنی کارشناس در بازه.
// اولین پاسخ: برای هر گفتگو، از اولین پیام مشتری تا اولین پاسخ متنی کارشناس؛ به نام همان پاسخ‌دهنده و اگر پاسخ در بازه باشد.
// نرخ تبدیل: از گفتگوهایی که در بازه به او ارجاع شد، درصدی که «درخواست مشتری» دارند (درخواست در هر زمانی).
export async function staffPerformance(w: Win) {
  if (!(await chatReady())) return [];
  const followup = await followupReady();
  const r = await db.execute<{ id: string; name: string; assigned: string; replies: string; avg_first_sec: string | null; first_n: string; with_inquiry: string }>(sql`
    with asg as (
      select (m.meta->>'to')::uuid as staff_id, m.conversation_id from chat_messages m
      where m.kind = 'event' and m.meta->>'event' = 'assign' and m.meta->>'to' is not null and ${inWin("m.created_at", w)}),
    rep as (
      select sender_user_id as staff_id, count(*) as n from chat_messages
      where sender_type = 'staff' and kind = 'text' and sender_user_id is not null and ${inWin("created_at", w)} group by sender_user_id),
    first_c as (
      select conversation_id, min(created_at) as at from chat_messages where sender_type = 'customer' group by conversation_id),
    first_r as (
      select distinct on (m.conversation_id) m.conversation_id, m.sender_user_id as staff_id, m.created_at as at, f.at as cust_at
      from chat_messages m join first_c f on f.conversation_id = m.conversation_id
      where m.sender_type = 'staff' and m.kind = 'text' and m.created_at > f.at
      order by m.conversation_id, m.created_at),
    fr as (
      select staff_id, avg(extract(epoch from at - cust_at)) as avg_sec, count(*) as n from first_r where ${inWin("at", w)} group by staff_id),
    conv as (
      select a.staff_id, count(distinct a.conversation_id) as assigned,
        ${followup ? sql`count(distinct a.conversation_id) filter (where exists (select 1 from inquiries i where i.conversation_id = a.conversation_id))` : sql`0`} as with_inquiry
      from asg a group by a.staff_id),
    ids as (select staff_id from conv union select staff_id from rep union select staff_id from fr)
    select u.id, u.full_name as name, coalesce(conv.assigned, 0) as assigned, coalesce(rep.n, 0) as replies,
      fr.avg_sec as avg_first_sec, coalesce(fr.n, 0) as first_n, coalesce(conv.with_inquiry, 0) as with_inquiry
    from ids join users u on u.id = ids.staff_id
    left join conv on conv.staff_id = ids.staff_id left join rep on rep.staff_id = ids.staff_id left join fr on fr.staff_id = ids.staff_id
    order by coalesce(rep.n, 0) desc, u.full_name`);
  return r.rows.map((x) => {
    const assigned = n(x.assigned);
    const withInquiry = n(x.with_inquiry);
    return {
      id: x.id,
      name: x.name,
      assigned,
      replies: n(x.replies),
      avgFirstSec: x.avg_first_sec === null ? null : Number(x.avg_first_sec),
      firstCount: n(x.first_n),
      withInquiry,
      conversion: assigned ? Math.round((withInquiry / assigned) * 100) : null,
    };
  });
}

// ---------- آمار AI (فقط ساختار؛ تا AI راه نیفتد صفر/خالی است) ----------
export async function aiStats(w: Win) {
  if (!(await chatReady())) return { autoReplyPct: null, referralPct: null, thumbsDown: null };
  const r = await db.execute<{ ai: string; staff: string; ai_convs: string; flagged: string }>(sql`
    select
      count(*) filter (where sender_type = 'ai' and kind = 'text') as ai,
      count(*) filter (where sender_type = 'staff' and kind = 'text') as staff,
      count(distinct conversation_id) filter (where sender_type = 'ai') as ai_convs,
      (select count(distinct conversation_id) from conversation_flags where ${inWin("created_at", w)}) as flagged
    from chat_messages where ${inWin("created_at", w)}`);
  const x = r.rows[0];
  const replies = n(x.ai) + n(x.staff);
  return {
    autoReplyPct: replies ? Math.round((n(x.ai) / replies) * 100) : null,
    referralPct: n(x.ai_convs) ? Math.round((n(x.flagged) / n(x.ai_convs)) * 100) : null,
    // 👎 هنوز جایی ثبت نمی‌شود (بعد از ساخت بازخورد پاسخ AI)
    thumbsDown: null as number | null,
  };
}

export function fmtDuration(sec: number | null): string {
  if (sec === null) return "—";
  const fa = (v: number) => v.toLocaleString("fa-IR");
  if (sec < 60) return `${fa(Math.round(sec))} ثانیه`;
  if (sec < 3600) return `${fa(Math.round(sec / 60))} دقیقه`;
  if (sec < 86400) return `${fa(Math.round((sec / 3600) * 10) / 10)} ساعت`;
  return `${fa(Math.round((sec / 86400) * 10) / 10)} روز`;
}
