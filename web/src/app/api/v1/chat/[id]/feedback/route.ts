import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiFeedback, chatMessages, conversationFlags } from "@/db/schema";
import { apiError, apiJson } from "@/lib/api";
import { chatCustomerGuard } from "@/lib/chat/customer-api";
import { getConversation } from "@/lib/chat/service";
import { suggestFromAiMessage } from "@/lib/ai/suggestions";
import { aiReady } from "@/lib/db-ready";

// 👍/👎 مشتری برای یک جواب دستیار هوشمند در گفتگوی خودش. {messageId, value: "up" | "down"}. docs/infoyaarchin.md بخش ۲۹.
// 👎 ← برچسب «نیاز به بررسی» روی گفتگو و «پیشنهاد سؤال تازه» (یک بار برای هر پیام).
export async function POST(req: Request, ctx: RouteContext<"/api/v1/chat/[id]/feedback">) {
  const g = await chatCustomerGuard(req, { json: true });
  if ("res" in g) return g.res;
  if (!(await aiReady())) return apiError(404, "not_found", "پیدا نشد.");
  const conv = await getConversation((await ctx.params).id);
  if (!conv || conv.customerId !== g.a.user.id) return apiError(404, "not_found", "گفتگو پیدا نشد.");
  const b = (await req.json().catch(() => null)) as { messageId?: unknown; value?: unknown } | null;
  const messageId = Number(b?.messageId);
  const value = b?.value === "up" || b?.value === "down" ? b.value : null;
  if (!Number.isInteger(messageId) || !value) return apiError(400, "bad_request", "درخواست نامعتبر است.");
  const [m] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.conversationId, conv.id), eq(chatMessages.senderType, "ai"), eq(chatMessages.visibleToCustomer, true)));
  if (!m) return apiError(404, "not_found", "پیام پیدا نشد.");
  await db
    .insert(aiFeedback)
    .values({ messageId, userId: g.a.user.id, source: "customer", value })
    .onConflictDoUpdate({ target: [aiFeedback.messageId, aiFeedback.userId, aiFeedback.source], set: { value, updatedAt: new Date() } });
  if (value === "down") {
    const [open] = await db
      .select({ id: conversationFlags.id })
      .from(conversationFlags)
      .where(and(eq(conversationFlags.conversationId, conv.id), eq(conversationFlags.messageId, messageId), sql`${conversationFlags.resolvedAt} is null`));
    if (!open) await db.insert(conversationFlags).values({ conversationId: conv.id, messageId, flag: "needs_review", reason: "👎 مشتری", source: "system" });
    // «پیشنهاد سؤال تازه» (یک بار برای هر پیام؛ بخش ۳۳)
    if (!open) await suggestFromAiMessage(conv.id, messageId, "thumbs_down");
  }
  return apiJson({ ok: true });
}
