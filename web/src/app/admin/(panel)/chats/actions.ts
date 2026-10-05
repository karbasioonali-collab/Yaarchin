"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireStaff } from "@/lib/auth/current";
import { canChangeStatus, canReply, canSee, chatAccess } from "@/lib/chat/access";
import { type StaffMsg, toStaffMsg } from "@/lib/chat/dto";
import { assignConversation, cleanBody, getConversation, isAssignable, postStaffMessage, setConversationStatus } from "@/lib/chat/service";
import { chatReady } from "@/lib/db-ready";
import { getSetting, setSetting } from "@/lib/settings";

// نوشتنی‌های بخش «گفتگوها»ی پنل. هر کدام دسترسی را خودش دوباره بررسی می‌کند (lib/chat/access.ts)؛ همه در لاگ فعالیت.
const NOT_READY = "جدول‌های گفتگو هنوز ساخته نشده‌اند؛ در کنسول لیارا npm run db:migrate را اجرا کنید.";
const UUID = /^[0-9a-f-]{36}$/i;

type Loaded =
  | { error: string }
  | { a: Awaited<ReturnType<typeof requireStaff>>; access: Awaited<ReturnType<typeof chatAccess>>; conv: NonNullable<Awaited<ReturnType<typeof getConversation>>> };
async function load(id: string): Promise<Loaded> {
  const a = await requireStaff();
  if (!(await chatReady())) return { error: NOT_READY };
  const access = await chatAccess(a.user);
  const conv = UUID.test(id) ? await getConversation(id) : null;
  if (!conv || !canSee(access, conv)) return { error: "گفتگو پیدا نشد یا به آن دسترسی ندارید." };
  return { a, access, conv };
}

// پاسخ کارشناس (از کامپوننت client صدا زده می‌شود؛ server action خودش Origin را بررسی می‌کند)
export async function sendStaffMessageAction(conversationId: string, raw: string): Promise<{ error: string } | { message: StaffMsg }> {
  const r = await load(String(conversationId));
  if ("error" in r) return { error: r.error };
  if (!canReply(r.access, r.conv)) {
    return { error: r.conv.status === "closed" ? "گفتگو بسته است؛ اول بازش کنید." : "فقط کارشناسی که گفتگو به او ارجاع شده پاسخ می‌دهد. اول «ارجاع به خودم» را بزنید." };
  }
  const body = cleanBody(raw);
  if (!body) return { error: "پیام خالی است." };
  const m = await postStaffMessage(r.conv, r.a.user.id, body);
  await logActivity({
    actorUserId: r.a.user.id,
    actingAsUserId: r.a.session.impersonatingUserId,
    action: "chat.reply",
    entityType: "conversation",
    entityId: r.conv.id,
    after: { messageId: m.id, length: body.length },
  });
  return { message: toStaffMsg({ ...m, senderName: r.a.user.fullName }) };
}

// ارجاع / جابه‌جایی / برداشتن ارجاع. to = شناسه‌ی کارشناس، "me" یا "" (برداشتن ارجاع).
export async function assignAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await load(String(fd.get("id") ?? ""));
  if ("error" in r) return { error: r.error };
  if (!r.access.assign) return { error: "دسترسی ارجاع گفتگو ندارید." };
  const raw = String(fd.get("to") ?? "");
  const toId = raw === "me" ? r.a.user.id : raw;
  if (toId && !UUID.test(toId)) return { error: "کارشناس نامعتبر است." };
  if ((toId || null) === r.conv.assignedTo) return { ok: "بدون تغییر." };
  let to: { id: string; fullName: string } | null = null;
  if (toId) {
    if (!(await isAssignable(toId))) return { error: "این کاربر فعال نیست یا دسترسی پاسخ به گفتگو ندارد." };
    const [u] = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.id, toId));
    to = u;
  }
  const [from] = r.conv.assignedTo ? await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, r.conv.assignedTo)) : [];
  await assignConversation(r.conv, to, { id: r.a.user.id, fullName: r.a.user.fullName }, from?.fullName ?? null);
  await logActivity({
    actorUserId: r.a.user.id,
    actingAsUserId: r.a.session.impersonatingUserId,
    action: to ? "chat.assign" : "chat.unassign",
    entityType: "conversation",
    entityId: r.conv.id,
    before: { assignedTo: r.conv.assignedTo, name: from?.fullName ?? null },
    after: { assignedTo: to?.id ?? null, name: to?.fullName ?? null },
  });
  revalidatePath("/admin", "layout");
  return { ok: to ? `به ${to.fullName} ارجاع شد.` : "ارجاع برداشته شد؛ گفتگو در صف «ارجاع‌نشده» است." };
}

export async function statusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await load(String(fd.get("id") ?? ""));
  if ("error" in r) return { error: r.error };
  if (!canChangeStatus(r.access, r.conv)) return { error: "دسترسی بستن یا بازکردن این گفتگو را ندارید." };
  const status = fd.get("status") === "closed" ? "closed" : "open";
  if (status === r.conv.status) return { ok: "بدون تغییر." };
  await setConversationStatus(r.conv, status, { id: r.a.user.id, fullName: r.a.user.fullName });
  await logActivity({
    actorUserId: r.a.user.id,
    actingAsUserId: r.a.session.impersonatingUserId,
    action: status === "closed" ? "chat.close" : "chat.reopen",
    entityType: "conversation",
    entityId: r.conv.id,
    before: { status: r.conv.status },
    after: { status },
  });
  revalidatePath("/admin", "layout");
  return { ok: status === "closed" ? "گفتگو بسته شد." : "گفتگو دوباره باز شد." };
}

// متن پیام خودکار بعد از اولین پیام مشتری (تنظیم chat.auto_reply). خالی = پیام خودکار فرستاده نمی‌شود.
export async function saveAutoReplyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requireStaff();
  const access = await chatAccess(a.user);
  if (!access.assign) return { error: "دسترسی ویرایش پیام خودکار ندارید." };
  const text = cleanBody(fd.get("text"), 1000) ?? "";
  const before = await getSetting<string>("chat.auto_reply");
  if (before === text) return { ok: "بدون تغییر." };
  try {
    await setSetting("chat.auto_reply", text, a.user.id);
  } catch {
    return { error: "تنظیم chat.auto_reply در دیتابیس نیست؛ در کنسول لیارا npm run db:seed را اجرا کنید." };
  }
  await logActivity({ actorUserId: a.user.id, action: "setting.update", entityType: "setting", entityId: "chat.auto_reply", before, after: text });
  revalidatePath("/admin", "layout");
  return { ok: text ? "ذخیره شد." : "ذخیره شد؛ پیام خودکار خاموش است." };
}
