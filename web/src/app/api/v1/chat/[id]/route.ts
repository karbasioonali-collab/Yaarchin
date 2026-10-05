import { apiError, apiJson } from "@/lib/api";
import { chatCustomerGuard, queueNewChatAlert } from "@/lib/chat/customer-api";
import { toCustomerMsg } from "@/lib/chat/dto";
import { cleanBody, customerRateLimited, getConversation, markRead, messagesOf, postCustomerMessage } from "@/lib/chat/service";

// یک گفتگوی مشتری:
//   GET  ?after=<id>&read=1  ← پیام‌های تازه بعد از id (polling سبک؛ read=1 فقط وقتی تب جلوی چشم است، تا «خوانده‌شده» درست بماند)
//   POST {message}           ← ادامه‌ی گفتگو (گفتگوی بسته با همین پیام دوباره باز می‌شود)
// فقط صاحب گفتگو؛ گفتگوی دیگران «پیدا نشد» است (نه «دسترسی ندارید») تا وجودش لو نرود.
export async function GET(req: Request, ctx: RouteContext<"/api/v1/chat/[id]">) {
  const g = await chatCustomerGuard(req, { json: false });
  if ("res" in g) return g.res;
  const conv = await getConversation((await ctx.params).id);
  if (!conv || conv.customerId !== g.a.user.id) return apiError(404, "not_found", "گفتگو پیدا نشد.");
  const sp = new URL(req.url).searchParams;
  const after = Math.max(0, Math.floor(Number(sp.get("after")) || 0));
  const msgs = await messagesOf(conv.id, { afterId: after || undefined, forCustomer: true });
  if (sp.get("read") === "1") await markRead(conv.id, g.a.user.id, msgs.at(-1)?.id ?? 0);
  return apiJson({ conversation: { id: conv.id, status: conv.status }, messages: msgs.map(toCustomerMsg) });
}

export async function POST(req: Request, ctx: RouteContext<"/api/v1/chat/[id]">) {
  const g = await chatCustomerGuard(req, { json: true });
  if ("res" in g) return g.res;
  const b = (await req.json().catch(() => null)) as { message?: unknown } | null;
  const body = cleanBody(b?.message);
  if (!body) return apiError(400, "empty", "پیام خالی است.");
  const limited = await customerRateLimited(g.a.user.id, false);
  if (limited) return apiError(429, "rate_limited", limited);
  const r = await postCustomerMessage({ customerId: g.a.user.id, body, conversationId: (await ctx.params).id });
  if ("error" in r) return apiError(404, "not_found", "گفتگو پیدا نشد.");
  await queueNewChatAlert(r, g.a.user.fullName);
  return apiJson({
    conversation: { id: r.conversation.id, status: r.conversation.status },
    messages: [r.message, ...(r.autoReply ? [r.autoReply] : [])].map((m) => toCustomerMsg(m)),
  });
}
