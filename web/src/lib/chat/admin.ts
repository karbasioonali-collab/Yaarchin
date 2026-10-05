import "server-only";
// خواندنی‌های بخش «گفتگوها»ی پنل: فهرست با فیلتر، شمارنده‌ها و رویدادهای اعلان (pulse).
import { and, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { categories, conversations, products, users } from "@/db/schema";
import { toLatinDigits } from "@/lib/validation";
import type { ChatAccess } from "./access";
import { staffUnreadExpr } from "./service";

export type ChatFilters = {
  tab: "unassigned" | "mine" | "all";
  expert: string; // uuid | ""
  category: string[]; // شناسه‌های دسته و زیرشاخه‌ها؛ ["general"] = فقط عمومی
  status: "open" | "closed" | "any";
  from: Date | null;
  to: Date | null;
  q: string;
};

const expertUser = alias(users, "expert");

export async function listConversations(a: ChatAccess, f: ChatFilters, page: number, perPage = 30) {
  const conds: SQL[] = [];
  // کسی که همه را نمی‌بیند (فقط chats.reply) فقط گفتگوهای ارجاع‌شده به خودش را می‌بیند، هر فیلتری که بدهد
  if (!a.viewAll || f.tab === "mine") conds.push(eq(conversations.assignedTo, a.userId));
  else if (f.tab === "unassigned") conds.push(isNull(conversations.assignedTo));
  if (f.expert && a.viewAll) conds.push(eq(conversations.assignedTo, f.expert));
  if (f.status !== "any") conds.push(eq(conversations.status, f.status));
  if (f.category.length === 1 && f.category[0] === "general") conds.push(eq(conversations.kind, "general"));
  else if (f.category.length) conds.push(inArray(products.categoryId, f.category));
  if (f.from) conds.push(gte(conversations.lastMessageAt, f.from));
  if (f.to) conds.push(lt(conversations.lastMessageAt, f.to));
  if (f.q) {
    const digits = toLatinDigits(f.q).replace(/\D/g, "");
    conds.push(or(ilike(users.fullName, `%${f.q}%`), ...(digits.length >= 4 ? [ilike(users.mobile, `%${digits.replace(/^0/, "")}%`)] : []))!);
  }
  const where = conds.length ? and(...conds) : undefined;
  const base = db
    .select({
      id: conversations.id,
      kind: conversations.kind,
      subject: conversations.subject,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
      attention: conversations.attention,
      customerId: conversations.customerId,
      customerName: users.fullName,
      customerMobile: users.mobile,
      productId: conversations.productId,
      productTitle: products.titleFa,
      categoryName: categories.nameFa,
      expertId: conversations.assignedTo,
      expertName: expertUser.fullName,
      unread: staffUnreadExpr(a.userId),
      preview: sql<string | null>`(select m.body from chat_messages m where m.conversation_id = ${conversations.id} and m.kind = 'text' order by m.id desc limit 1)`,
    })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.customerId))
    .leftJoin(products, eq(products.id, conversations.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(expertUser, eq(expertUser.id, conversations.assignedTo));
  const [rows, [{ total }]] = await Promise.all([
    base
      .where(where)
      .orderBy(desc(conversations.lastMessageAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(conversations)
      .innerJoin(users, eq(users.id, conversations.customerId))
      .leftJoin(products, eq(products.id, conversations.productId))
      .where(where),
  ]);
  return { rows, total };
}

// شمارنده‌های نشان منو و عنوان تب:
//   mine       = پیام‌های خوانده‌نشده‌ی مشتری در گفتگوهای باز ارجاع‌شده به من
//   unassigned = گفتگوهای باز بدون کارشناس (فقط برای کسی که می‌تواند ارجاع دهد)
export async function chatCounters(a: ChatAccess): Promise<{ mine: number; unassigned: number; total: number }> {
  const [r] = await db
    .select({
      mine: sql<number>`coalesce(sum(case when ${conversations.assignedTo} = ${a.userId} then ${staffUnreadExpr(a.userId)} else 0 end), 0)::int`,
      unassigned: sql<number>`count(*) filter (where ${conversations.assignedTo} is null)::int`,
    })
    .from(conversations)
    .where(eq(conversations.status, "open"));
  const mine = r?.mine ?? 0;
  const unassigned = a.assign ? (r?.unassigned ?? 0) : 0;
  return { mine, unassigned, total: mine + unassigned };
}

export type PulseEvent = { id: number; type: "new_chat" | "assigned_to_me" | "new_message"; conversationId: string; text: string };

// رویدادهای اعلان مرورگر بعد از پیام شماره‌ی cursor (شماره‌ی پیام‌ها bigserial و صعودی است، پس یک عدد کافی است):
//   new_chat       ← اولین پیام یک گفتگوی تازه (برای کسی که ارجاع می‌دهد)
//   assigned_to_me ← رویداد ارجاع به من (به‌جز وقتی خودم ارجاع داده‌ام)
//   new_message    ← پیام مشتری در گفتگوی ارجاع‌شده به من
export async function pulseEvents(a: ChatAccess, cursor: number): Promise<{ cursor: number; events: PulseEvent[] }> {
  const [{ maxId }] = await db.execute<{ maxId: number | null }>(sql`select max(id)::bigint as "maxId" from chat_messages`).then((r) => r.rows);
  const latest = Number(maxId ?? 0);
  if (!cursor || cursor > latest) return { cursor: latest, events: [] };
  const r = await db.execute<{ id: number; conversation_id: string; type: PulseEvent["type"]; who: string | null; body: string }>(sql`
    select m.id, m.conversation_id, m.body,
      case
        when m.kind = 'event' then 'assigned_to_me'
        when not exists (select 1 from chat_messages p where p.conversation_id = m.conversation_id and p.id < m.id) then 'new_chat'
        else 'new_message'
      end as type,
      u.full_name as who
    from chat_messages m
    join conversations c on c.id = m.conversation_id
    left join users u on u.id = c.customer_id
    where m.id > ${cursor} and m.id <= ${latest} and (
      (m.kind = 'event' and m.meta->>'event' = 'assign' and m.meta->>'to' = ${a.userId} and m.meta->>'by' <> ${a.userId})
      or (m.sender_type = 'customer' and c.assigned_to = ${a.userId})
      or (${a.assign} and m.sender_type = 'customer' and c.assigned_to is null
          and not exists (select 1 from chat_messages p where p.conversation_id = m.conversation_id and p.id < m.id))
    )
    order by m.id limit 20`);
  const events = r.rows.map((x) => ({
    id: Number(x.id),
    type: x.type,
    conversationId: x.conversation_id,
    text:
      x.type === "assigned_to_me"
        ? `گفتگوی ${x.who ?? "مشتری"} به شما ارجاع شد`
        : x.type === "new_chat"
          ? `گفتگوی تازه از ${x.who ?? "مشتری"}: ${x.body.slice(0, 80)}`
          : `${x.who ?? "مشتری"}: ${x.body.slice(0, 80)}`,
  }));
  return { cursor: latest, events };
}
