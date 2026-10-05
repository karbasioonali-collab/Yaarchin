import "server-only";
// چه کسی در پنل کدام گفتگو را می‌بیند و چه کاری می‌تواند بکند (ادمین همیشه همه‌چیز؛ قاعده‌ی can() در lib/auth/can.ts).
//   chats.view_all ← دیدن همه (فقط خواندن)
//   chats.reply    ← دیدن و پاسخ، بستن و بازکردن گفتگوهای ارجاع‌شده به خود
//   chats.assign   ← دیدن همه، ارجاع و جابه‌جایی، بستن و بازکردن همه، ویرایش پیام خودکار
// پاسخ فقط با کارشناس ارجاع‌گرفته (و ادمین) است؛ برای پاسخ به گفتگوی ارجاع‌نشده، اول «ارجاع به خودم» (تصمیم مالک، گزینه‌ی الف).
import { can } from "@/lib/auth/can";
import type { CurrentUser } from "@/lib/auth/current";
import type { Conversation } from "./service";

export const CHAT_PERMS = ["chats.view_all", "chats.reply", "chats.assign"];

export type ChatAccess = { admin: boolean; viewAll: boolean; reply: boolean; assign: boolean; userId: string };

export async function chatAccess(user: CurrentUser): Promise<ChatAccess> {
  const [viewAll, reply, assign] = await Promise.all([can(user, "chats.view_all"), can(user, "chats.reply"), can(user, "chats.assign")]);
  return { admin: user.isAdmin, viewAll: user.isAdmin || viewAll || assign, reply: user.isAdmin || reply, assign: user.isAdmin || assign, userId: user.id };
}

export const canSee = (a: ChatAccess, c: Pick<Conversation, "assignedTo">) => a.viewAll || (a.reply && c.assignedTo === a.userId);
export const canReply = (a: ChatAccess, c: Pick<Conversation, "assignedTo" | "status">) => c.status === "open" && (a.admin || (a.reply && c.assignedTo === a.userId));
export const canChangeStatus = (a: ChatAccess, c: Pick<Conversation, "assignedTo">) => a.assign || (a.reply && c.assignedTo === a.userId);
