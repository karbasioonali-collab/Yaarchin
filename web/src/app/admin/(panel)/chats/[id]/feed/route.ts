import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/current";
import { canSee, chatAccess } from "@/lib/chat/access";
import { toStaffMsg } from "@/lib/chat/dto";
import { getConversation, markRead, messagesOf } from "@/lib/chat/service";
import { chatReady } from "@/lib/db-ready";

// polling صفحه‌ی گفتگوی پنل: GET ?after=<id>&read=1 ← پیام‌های تازه (با رویدادهای داخلی و اسم کارشناس‌ها) و وضعیت فعلی.
// read=1 فقط وقتی تب جلوی چشم است؛ «خوانده‌شده» هر کارمند جداست (conversation_reads).
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: Request, ctx: RouteContext<"/admin/chats/[id]/feed">) {
  const a = await getAuth();
  if (!a?.user.isStaff) return json({ error: "login_required" }, 401);
  if (!(await chatReady())) return json({ error: "not_ready" }, 503);
  const access = await chatAccess(a.user);
  const conv = await getConversation((await ctx.params).id);
  if (!conv || !canSee(access, conv)) return json({ error: "not_found" }, 404);
  const sp = new URL(req.url).searchParams;
  const after = Math.max(0, Math.floor(Number(sp.get("after")) || 0));
  const msgs = await messagesOf(conv.id, { afterId: after || undefined, forCustomer: false });
  if (sp.get("read") === "1") await markRead(conv.id, a.user.id, msgs.at(-1)?.id ?? 0);
  return json({ status: conv.status, assignedTo: conv.assignedTo, messages: msgs.map(toStaffMsg) });
}
