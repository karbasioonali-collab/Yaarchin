"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { contactMessages } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/can";

const STATUSES = ["new", "read", "archived"] as const;
type Status = (typeof STATUSES)[number];

export async function setMessageStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("contact.view");
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "") as Status;
  if (!STATUSES.includes(status) || !/^[0-9a-f-]{36}$/.test(id)) return { error: "درخواست نامعتبر است." };
  const [before] = await db.select({ status: contactMessages.status }).from(contactMessages).where(eq(contactMessages.id, id));
  if (!before) return { error: "پیام پیدا نشد." };
  await db
    .update(contactMessages)
    .set({ status, handledBy: a.user.id, handledAt: new Date() })
    .where(eq(contactMessages.id, id));
  await logActivity({ actorUserId: a.user.id, action: "contact_message.status", entityType: "contact_message", entityId: id, before, after: { status } });
  revalidatePath("/admin/messages");
  return { ok: "ثبت شد." };
}
