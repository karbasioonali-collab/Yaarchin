import "server-only";
// منطق چت مشتری با کارشناس (بدون AI). همه‌ی نوشتن‌ها از همین فایل می‌گذرند تا قاعده‌ها یک جا باشند:
//   - پیام‌ها فقط افزودنی‌اند؛ ارجاع، بستن و بازکردن = «پیام رویداد» داخل خود چت + ردیف در لاگ فعالیت.
//   - ارجاع همیشه دستی است؛ گفتگوی تازه (محصولی یا عمومی) در صف «ارجاع‌نشده» (assigned_to = null) می‌نشیند.
//   - پیام مشتری در گفتگوی بسته، همان گفتگو را دوباره باز می‌کند؛ اگر کارشناس قبلی دیگر فعال نیست، به صف برمی‌گردد.
// docs/infoyaarchin.md بخش ۲۴.
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { chatMessages, conversationReads, conversations, users } from "@/db/schema";
import { getSetting } from "@/lib/settings";

export type Conversation = typeof conversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const MAX_BODY = 2000;
export const MAX_SUBJECT = 150;

// متن پیام: فاصله‌ی اول و آخر حذف، خطوط خالی پشت‌سرهم کم، طول محدود. خالی ← null.
export function cleanBody(raw: unknown, max = MAX_BODY): string | null {
  const s = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!s) return null;
  return s.slice(0, max);
}

async function insertMessage(tx: Tx, v: typeof chatMessages.$inferInsert): Promise<ChatMessage> {
  const [m] = await tx.insert(chatMessages).values(v).returning();
  return m;
}

// خوانده‌شدن تا پیام id (فقط جلو می‌رود، هرگز عقب)
export async function markRead(conversationId: string, userId: string, lastId: number, tx: Tx | typeof db = db): Promise<void> {
  if (!lastId) return;
  await tx
    .insert(conversationReads)
    .values({ conversationId, userId, lastReadMessageId: lastId })
    .onConflictDoUpdate({
      target: [conversationReads.conversationId, conversationReads.userId],
      set: { lastReadMessageId: sql`greatest(${conversationReads.lastReadMessageId}, ${lastId})`, updatedAt: new Date() },
    });
}

// کارمند فعالی که می‌تواند چت بگیرد: نقش کارمندی دارد و (ادمین است، یا سوئیچ دسترسی‌ها خاموش است، یا نقشش chats.reply دارد)
// همان قاعده‌ی can() (lib/auth/can.ts)، به‌شکل SQL برای فهرست کردن.
async function assignableWhere() {
  const enforce = (await getSetting<boolean>("auth.enforce_permissions")) === true;
  return sql`${users.status} = 'active' and exists (
    select 1 from user_roles ur join roles r on r.id = ur.role_id
    where ur.user_id = ${users.id} and r.is_staff
      and (r.key = 'admin' or ${!enforce} or exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission_key = 'chats.reply')))`;
}

export async function assignableStaff(): Promise<{ id: string; fullName: string }[]> {
  return db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(await assignableWhere())
    .orderBy(asc(users.fullName));
}

export async function isAssignable(userId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), await assignableWhere()));
  return !!r;
}

// ---------- مشتری ----------
// queued: گفتگو تازه به صف «ارجاع‌نشده» آمد (اولین پیام گفتگو، یا بازشدن دوباره بدون کارشناس) ← هشدار پیامکی (lib/chat/alerts.ts)
export type CustomerPostResult = { conversation: Conversation; message: ChatMessage; autoReply: ChatMessage | null; reopened: boolean; queued: boolean };

// پیام مشتری: گفتگوی محصول (پیدا یا ساخته می‌شود)، گفتگوی عمومی تازه (subject)، یا گفتگوی موجود (conversationId).
export async function postCustomerMessage(input: {
  customerId: string;
  body: string;
  productId?: string | null;
  conversationId?: string | null;
  subject?: string | null;
}): Promise<CustomerPostResult | { error: "not_found" }> {
  const autoReplyText = cleanBody(await getSetting<string>("chat.auto_reply"), 1000);
  return db.transaction(async (tx) => {
    let conv: Conversation | undefined;
    if (input.conversationId) {
      [conv] = await tx
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.customerId, input.customerId)))
        .for("update");
      if (!conv) return { error: "not_found" as const };
    } else if (input.productId) {
      // یک گفتگو برای هر مشتری × محصول؛ ساخت هم‌زمان با ایندکس یکتا و on conflict امن است
      await tx.insert(conversations).values({ customerId: input.customerId, kind: "product", productId: input.productId }).onConflictDoNothing();
      [conv] = await tx
        .select()
        .from(conversations)
        .where(and(eq(conversations.customerId, input.customerId), eq(conversations.productId, input.productId), eq(conversations.kind, "product")))
        .for("update");
    } else {
      [conv] = await tx
        .insert(conversations)
        .values({ customerId: input.customerId, kind: "general", subject: input.subject ?? null })
        .returning();
    }
    if (!conv) return { error: "not_found" as const };

    let reopened = false;
    if (conv.status === "closed") {
      reopened = true;
      // کارشناس قبلی هنوز فعال است و می‌تواند چت بگیرد؟ وگرنه به صف «ارجاع‌نشده»
      const keep = conv.assignedTo ? await isAssignable(conv.assignedTo) : false;
      [conv] = await tx
        .update(conversations)
        .set({ status: "open", closedAt: null, closedBy: null, ...(keep ? {} : { assignedTo: null, assignedAt: null }) })
        .where(eq(conversations.id, conv.id))
        .returning();
      await insertMessage(tx, {
        conversationId: conv.id,
        senderType: "system",
        kind: "event",
        body: keep ? "گفتگو با پیام مشتری دوباره باز شد." : "گفتگو با پیام مشتری دوباره باز شد و چون کارشناس قبلی دیگر فعال نیست، به صف «ارجاع‌نشده» رفت.",
        visibleToCustomer: false,
        meta: { event: "reopen", by: "customer", unassigned: !keep },
      });
    }

    const message = await insertMessage(tx, { conversationId: conv.id, senderType: "customer", senderUserId: input.customerId, body: input.body });
    // پیام خودکار فقط بعد از اولین پیام مشتری در این گفتگو
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(eq(chatMessages.conversationId, conv.id), eq(chatMessages.senderType, "customer")));
    const autoReply =
      n === 1 && autoReplyText ? await insertMessage(tx, { conversationId: conv.id, senderType: "system", body: autoReplyText, meta: { event: "auto_reply" } }) : null;
    const now = new Date();
    [conv] = await tx.update(conversations).set({ lastMessageAt: now, lastCustomerMessageAt: now }).where(eq(conversations.id, conv.id)).returning();
    await markRead(conv.id, input.customerId, (autoReply ?? message).id, tx);
    return { conversation: conv, message, autoReply, reopened, queued: !conv.assignedTo && (n === 1 || reopened) };
  });
}

// ---------- کارشناس ----------
export async function postStaffMessage(conv: Conversation, staffId: string, body: string): Promise<ChatMessage> {
  return db.transaction(async (tx) => {
    const m = await insertMessage(tx, { conversationId: conv.id, senderType: "staff", senderUserId: staffId, body });
    await tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conv.id));
    await markRead(conv.id, staffId, m.id, tx);
    return m;
  });
}

// ارجاع / جابه‌جایی / برداشتن ارجاع (to = null). رویداد داخلی در چت (مشتری نمی‌بیند).
export async function assignConversation(conv: Conversation, to: { id: string; fullName: string } | null, by: { id: string; fullName: string }, fromName: string | null) {
  return db.transaction(async (tx) => {
    await tx
      .update(conversations)
      .set({ assignedTo: to?.id ?? null, assignedAt: to ? new Date() : null })
      .where(eq(conversations.id, conv.id));
    const body = to
      ? fromName
        ? `${by.fullName} گفتگو را از ${fromName} به ${to.fullName} ارجاع داد.`
        : `${by.fullName} گفتگو را به ${to.fullName} ارجاع داد.`
      : `${by.fullName} ارجاع گفتگو را برداشت${fromName ? ` (قبلاً: ${fromName})` : ""}؛ گفتگو به صف «ارجاع‌نشده» برگشت.`;
    return insertMessage(tx, {
      conversationId: conv.id,
      senderType: "system",
      senderUserId: by.id,
      kind: "event",
      body,
      visibleToCustomer: false,
      meta: { event: "assign", from: conv.assignedTo, to: to?.id ?? null, by: by.id },
    });
  });
}

export async function setConversationStatus(conv: Conversation, status: "open" | "closed", by: { id: string; fullName: string }) {
  return db.transaction(async (tx) => {
    await tx
      .update(conversations)
      .set(status === "closed" ? { status, closedAt: new Date(), closedBy: by.id } : { status, closedAt: null, closedBy: null })
      .where(eq(conversations.id, conv.id));
    return insertMessage(tx, {
      conversationId: conv.id,
      senderType: "system",
      senderUserId: by.id,
      kind: "event",
      body: status === "closed" ? "گفتگو بسته شد. اگر سؤال دیگری دارید، همین‌جا بنویسید تا دوباره باز شود." : "گفتگو دوباره باز شد.",
      meta: { event: status === "closed" ? "close" : "reopen", by: by.id },
    });
  });
}

// ---------- خواندن ----------
export async function getConversation(id: string): Promise<Conversation | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await db.select().from(conversations).where(eq(conversations.id, id));
  return c ?? null;
}

export async function customerProductConversation(customerId: string, productId: string): Promise<Conversation | null> {
  const [c] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.customerId, customerId), eq(conversations.productId, productId), eq(conversations.kind, "product")));
  return c ?? null;
}

// پیام‌های یک گفتگو بعد از afterId (برای polling) یا ۲۰۰ پیام آخر. forCustomer: رویدادهای داخلی حذف می‌شوند.
export async function messagesOf(conversationId: string, opts: { afterId?: number; forCustomer: boolean }): Promise<(ChatMessage & { senderName: string | null })[]> {
  const conds = [eq(chatMessages.conversationId, conversationId)];
  if (opts.afterId) conds.push(gt(chatMessages.id, opts.afterId));
  if (opts.forCustomer) conds.push(eq(chatMessages.visibleToCustomer, true));
  const rows = await db
    .select({ m: chatMessages, senderName: users.fullName })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.senderUserId))
    .where(and(...conds))
    .orderBy(opts.afterId ? asc(chatMessages.id) : desc(chatMessages.id))
    .limit(200);
  const list = rows.map((r) => ({ ...r.m, senderName: r.senderName }));
  return opts.afterId ? list : list.reverse();
}

// خوانده‌نشده‌های مشتری در هر گفتگو (پیام‌های کارشناس/سیستم/AI بعد از آخرین خوانده‌شده؛ رویدادهای داخلی حساب نمی‌شوند)
export function customerUnreadExpr(customerId: string) {
  return sql<number>`(select count(*)::int from chat_messages m where m.conversation_id = ${conversations.id}
    and m.sender_type <> 'customer' and m.visible_to_customer
    and m.id > coalesce((select r.last_read_message_id from conversation_reads r where r.conversation_id = ${conversations.id} and r.user_id = ${customerId}), 0))`;
}

// خوانده‌نشده‌های یک کارشناس در هر گفتگو (پیام‌های مشتری بعد از آخرین خوانده‌شده‌ی خودش)
export function staffUnreadExpr(staffId: string) {
  return sql<number>`(select count(*)::int from chat_messages m where m.conversation_id = ${conversations.id}
    and m.sender_type = 'customer'
    and m.id > coalesce((select r.last_read_message_id from conversation_reads r where r.conversation_id = ${conversations.id} and r.user_id = ${staffId}), 0))`;
}

// تعداد کل خوانده‌نشده‌ی مشتری (نشان تب «گفتگوهای من»)
export async function customerUnreadTotal(customerId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${customerUnreadExpr(customerId)}), 0)::int` })
    .from(conversations)
    .where(eq(conversations.customerId, customerId));
  return r?.n ?? 0;
}

// محدودیت ارسال مشتری: حداکثر ۱۰ پیام در دقیقه و ۶۰ پیام در ساعت؛ حداکثر ۵ گفتگوی عمومی تازه در روز.
export async function customerRateLimited(customerId: string, newGeneral: boolean): Promise<string | null> {
  const [r] = await db
    .execute<{ m1: number; h1: number; g: number }>(
      sql`
    select
      (select count(*)::int from chat_messages where sender_user_id = ${customerId} and sender_type = 'customer' and created_at > now() - interval '1 minute') as m1,
      (select count(*)::int from chat_messages where sender_user_id = ${customerId} and sender_type = 'customer' and created_at > now() - interval '1 hour') as h1,
      (select count(*)::int from conversations where customer_id = ${customerId} and kind = 'general' and created_at > now() - interval '1 day') as g`,
    )
    .then((x) => x.rows);
  if (r.m1 >= 10 || r.h1 >= 60) return "تعداد پیام‌ها زیاد بود؛ چند دقیقه‌ی دیگر دوباره بفرستید.";
  if (newGeneral && r.g >= 5) return "امروز گفتگوی تازه‌ی زیادی شروع کرده‌اید؛ لطفاً در همان گفتگوهای قبلی ادامه دهید.";
  return null;
}
