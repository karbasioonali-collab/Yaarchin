import { apiError, apiJson } from "@/lib/api";
import { publishedProductId } from "@/lib/catalog/public";
import { chatCustomerGuard, queueNewChatAlert } from "@/lib/chat/customer-api";
import { toCustomerMsg } from "@/lib/chat/dto";
import { cleanBody, customerProductConversation, customerRateLimited, MAX_SUBJECT, markRead, messagesOf, postCustomerMessage } from "@/lib/chat/service";

// چت مشتری (فقط مشتری واردشده؛ سوئیچ features.chat).
//   GET  ?product=<slug>                 ← گفتگوی همین محصول (یا null) و پیام‌هایش
//   POST {product, message}              ← پیام درباره‌ی محصول (گفتگو اگر نباشد ساخته، اگر بسته باشد دوباره باز می‌شود)
//   POST {subject, message}              ← گفتگوی عمومی تازه (مثلاً درخواست محصولی که روی سایت نیست)
// ادامه‌ی یک گفتگو: /api/v1/chat/<id>
const SLUG = /^[a-z0-9-]{1,120}$/;

export async function GET(req: Request) {
  const g = await chatCustomerGuard(req, { json: false });
  if ("res" in g) return g.res;
  const slug = new URL(req.url).searchParams.get("product") ?? "";
  const productId = SLUG.test(slug) ? await publishedProductId(slug) : null;
  if (!productId) return apiError(404, "not_found", "محصول پیدا نشد.");
  const conv = await customerProductConversation(g.a.user.id, productId);
  if (!conv) return apiJson({ conversation: null, messages: [] });
  const msgs = await messagesOf(conv.id, { forCustomer: true });
  await markRead(conv.id, g.a.user.id, msgs.at(-1)?.id ?? 0);
  return apiJson({ conversation: { id: conv.id, status: conv.status }, messages: msgs.map(toCustomerMsg) });
}

export async function POST(req: Request) {
  const g = await chatCustomerGuard(req, { json: true });
  if ("res" in g) return g.res;
  const b = (await req.json().catch(() => null)) as { product?: unknown; subject?: unknown; message?: unknown } | null;
  const body = cleanBody(b?.message);
  if (!body) return apiError(400, "empty", "پیام خالی است.");
  let productId: string | null = null;
  let subject: string | null = null;
  if (typeof b?.product === "string") {
    productId = SLUG.test(b.product) ? await publishedProductId(b.product) : null;
    if (!productId) return apiError(404, "not_found", "محصول پیدا نشد.");
  } else {
    subject = cleanBody(b?.subject, MAX_SUBJECT);
    if (!subject || subject.length < 3) return apiError(400, "subject_required", "موضوع گفتگو را بنویسید (مثلاً اسم محصولی که دنبالش هستید).");
  }
  const limited = await customerRateLimited(g.a.user.id, !productId);
  if (limited) return apiError(429, "rate_limited", limited);
  const r = await postCustomerMessage({ customerId: g.a.user.id, body, productId, subject });
  if ("error" in r) return apiError(404, "not_found", "گفتگو پیدا نشد.");
  await queueNewChatAlert(r, g.a.user.fullName);
  return apiJson({
    conversation: { id: r.conversation.id, status: r.conversation.status },
    messages: [r.message, ...(r.autoReply ? [r.autoReply] : [])].map((m) => toCustomerMsg(m)),
  });
}
