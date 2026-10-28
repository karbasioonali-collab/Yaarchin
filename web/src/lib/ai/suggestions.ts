import "server-only";
// «پیشنهاد سؤال تازه»: سؤال‌هایی از چت‌های واقعی (فقط حالت زنده) که دستیار جواب نداد، ارجاع داد، 👎 گرفت، کارشناس «اشتباه» زد،
// تکرار شد یا محافظ جلویش را گرفت؛ به‌علاوه نتیجه‌ی «اشتباه» آزمون و پیشنهاد AI. هیچ‌چیز خودکار به پایگاه دانش یا آزمون
// اضافه نمی‌شود. تکراری‌ها با کلید یکسان‌شده‌ی سؤال + نوع یکی می‌شوند (count و last_seen_at). docs/infoyaarchin.md بخش ۳۳.
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiSuggestions, chatMessages } from "@/db/schema";
import { aiTestsReady } from "@/lib/db-ready";
import { type SuggestionKind, suggestionKey } from "./learn";

export type SuggestionInput = { question: string; kind: SuggestionKind; detail?: string | null; conversationId?: string | null; messageId?: number | null };

// هیچ‌وقت خطا نمی‌دهد (مسیر چت مشتری نباید به‌خاطر این بخش بشکند)
export async function addSuggestion(s: SuggestionInput): Promise<void> {
  try {
    if (!(await aiTestsReady())) return;
    const key = suggestionKey(s.question);
    if (key.length < 2) return;
    await db
      .insert(aiSuggestions)
      .values({
        questionKey: key,
        question: s.question.trim().slice(0, 1000),
        kind: s.kind,
        detail: s.detail?.slice(0, 300) ?? null,
        conversationId: s.conversationId ?? null,
        messageId: s.messageId ?? null,
      })
      .onConflictDoUpdate({
        target: [aiSuggestions.questionKey, aiSuggestions.kind],
        // وضعیت و متن اول عوض نمی‌شوند: ردشده یا تبدیل‌شده دوباره باز نمی‌شود؛ فقط شمارش و آخرین بار
        set: {
          count: sql`${aiSuggestions.count} + 1`,
          lastSeenAt: new Date(),
          ...(s.detail ? { detail: s.detail.slice(0, 300) } : {}),
          ...(s.conversationId ? { conversationId: s.conversationId, messageId: s.messageId ?? null } : {}),
        },
      });
  } catch (e) {
    console.error("ai suggestion failed", e);
  }
}

// برای 👎 مشتری و «جواب اشتباه» کارشناس: سؤال = آخرین پیام مشتری قبل از همان جواب دستیار
export async function suggestFromAiMessage(conversationId: string, aiMessageId: number, kind: SuggestionKind, detail?: string): Promise<void> {
  try {
    if (!(await aiTestsReady())) return;
    // جواب حالت آزمایشی (مشتری ندیده) پیشنهاد نمی‌سازد؛ فقط چت زنده
    const [ai] = await db.select({ meta: chatMessages.meta }).from(chatMessages).where(eq(chatMessages.id, aiMessageId));
    if (!ai || (ai.meta as { test?: boolean } | null)?.test) return;
    const [q] = await db
      .select({ id: chatMessages.id, body: chatMessages.body })
      .from(chatMessages)
      .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.senderType, "customer"), sql`${chatMessages.id} < ${aiMessageId}`))
      .orderBy(desc(chatMessages.id))
      .limit(1);
    if (q) await addSuggestion({ question: q.body, kind, detail, conversationId, messageId: q.id });
  } catch (e) {
    console.error("ai suggestion failed", e);
  }
}

// بستن همه‌ی ردیف‌های باز همان سؤال (با تبدیل به پایگاه دانش یا آزمون، یا رد کردن)
export async function closeSuggestions(questionKey: string, status: "kb" | "test" | "dismissed", by: string, ref: string | null): Promise<number> {
  const r = await db
    .update(aiSuggestions)
    .set({ status, handledBy: by, handledAt: new Date(), convertedRef: ref })
    .where(and(eq(aiSuggestions.questionKey, questionKey), eq(aiSuggestions.status, "open")))
    .returning({ id: aiSuggestions.id });
  return r.length;
}

export async function openSuggestionCount(): Promise<number> {
  if (!(await aiTestsReady())) return 0;
  const [r] = await db
    .select({ n: sql<number>`count(distinct ${aiSuggestions.questionKey})::int` })
    .from(aiSuggestions)
    .where(eq(aiSuggestions.status, "open"));
  return r?.n ?? 0;
}
