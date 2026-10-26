import "server-only";
// وضعیت دستیار در هر گفتگو (ai_conversation_state) و سوئیچ کلی. docs/infoyaarchin.md بخش ۲۹.
import { eq, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db/client";
import { aiConversationState } from "@/db/schema";
import { aiReady } from "@/lib/db-ready";
import { isEnabled } from "@/lib/settings";
import { aiConfig } from "./config";

export type AiState = typeof aiConversationState.$inferSelect;

// دستیار برای مشتری‌ها «زنده» است؟ (سوئیچ روشن + migration + کلید لیارا). حالت آزمایشی = روشن بدون کلید.
export async function aiStatus(): Promise<"off" | "test" | "live"> {
  if (!(await aiReady()) || !(await isEnabled("ai_agent"))) return "off";
  return aiConfig().mode;
}

export async function getState(conversationId: string): Promise<AiState | null> {
  if (!(await aiReady())) return null;
  const [s] = await db.select().from(aiConversationState).where(eq(aiConversationState.conversationId, conversationId));
  return s ?? null;
}

export async function ensureState(conversationId: string): Promise<AiState> {
  await db.insert(aiConversationState).values({ conversationId }).onConflictDoNothing();
  return (await getState(conversationId))!;
}

// ساکت کردن دستیار در یک گفتگو (پیام کارشناس، ارجاع، واگذاری به کارشناس). بی‌اثر اگر ردیفی نیست (گفتگوی قبل از AI).
export async function silence(conversationId: string, reason: string, by: string | null): Promise<boolean> {
  if (!(await aiReady())) return false;
  const r = await db
    .update(aiConversationState)
    .set({ mode: "human", silencedAt: new Date(), silencedReason: reason, silencedBy: by, thinkingSince: null })
    .where(sql`${aiConversationState.conversationId} = ${conversationId} and ${aiConversationState.mode} = 'ai'`)
    .returning({ id: aiConversationState.conversationId });
  return r.length > 0;
}

export async function resume(conversationId: string): Promise<void> {
  await db
    .insert(aiConversationState)
    .values({ conversationId, mode: "ai" })
    .onConflictDoUpdate({ target: aiConversationState.conversationId, set: { mode: "ai", silencedAt: null, silencedReason: null, silencedBy: null, thinkingSince: null } });
}

export async function setThinking(conversationId: string, on: boolean): Promise<void> {
  await db
    .update(aiConversationState)
    .set({ thinkingSince: on ? new Date() : null })
    .where(eq(aiConversationState.conversationId, conversationId));
}

export async function addReply(conversationId: string): Promise<void> {
  await db
    .update(aiConversationState)
    .set({ replies: sql`${aiConversationState.replies} + 1`, thinkingSince: null })
    .where(eq(aiConversationState.conversationId, conversationId));
}

// نشانگر «دستیار در حال نوشتن…» برای مشتری (فقط دستیار زنده)
export async function assistantTyping(conversationId: string): Promise<boolean> {
  if ((await aiStatus()) !== "live") return false;
  const s = await getState(conversationId);
  return !!s && s.mode === "ai" && !!s.thinkingSince && Date.now() - s.thinkingSince.getTime() < 90_000;
}

// شرط SQL «این گفتگو در دست دستیار زنده است» برای صف و شمارنده‌های پنل (lib/chat/admin.ts). فقط وقتی دستیار زنده است
// گفتگوهای mode = ai از صف «ارجاع‌نشده» بیرون می‌مانند؛ با خاموش شدن سوئیچ یا حذف کلید همان لحظه به صف برمی‌گردند.
export async function aiHandledSql(convIdCol: SQLWrapper) {
  if ((await aiStatus()) !== "live") return sql`false`;
  return sql`exists (select 1 from ai_conversation_state s where s.conversation_id = ${convIdCol} and s.mode = 'ai')`;
}
