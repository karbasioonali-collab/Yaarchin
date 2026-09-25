"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ui/ActionForm";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/can";
import { BLOCK_KEYS, type BlockKey, normalize } from "@/lib/site/blocks";
import { formToObject, invalidHrefs } from "@/lib/site/form";
import { resetBlock, saveBlock } from "@/lib/site/get";

function blockKey(fd: FormData): BlockKey | null {
  const k = String(fd.get("__block") ?? "");
  return (BLOCK_KEYS as string[]).includes(k) ? (k as BlockKey) : null;
}

export async function saveBlockAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("site.manage");
  const key = blockKey(fd);
  if (!key) return { error: "بخش نامعتبر است." };
  const raw = formToObject(fd);
  const bad = invalidHrefs(raw);
  if (bad.length) return { error: `این آدرس‌ها پذیرفته نیستند: ${bad.join("، ")} — آدرس باید با / (صفحه‌ی داخلی) یا https:// شروع شود.` };
  const isVisible = raw.__visible === undefined ? true : raw.__visible === true;
  delete raw.__visible;
  const data = normalize[key](raw);
  const { before } = await saveBlock(key, data, isVisible, a.user.id);
  await logActivity({ actorUserId: a.user.id, action: "site_block.update", entityType: "site_block", entityId: key, before, after: { data, isVisible } });
  revalidatePath("/", "layout");
  return { ok: "ذخیره شد. تغییر همین حالا روی سایت دیده می‌شود." };
}

export async function resetBlockAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("site.manage");
  const key = blockKey(fd);
  if (!key) return { error: "بخش نامعتبر است." };
  const { before } = await resetBlock(key);
  await logActivity({ actorUserId: a.user.id, action: "site_block.reset", entityType: "site_block", entityId: key, before });
  revalidatePath("/", "layout");
  return { ok: "به مقدار پیش‌فرض برگشت." };
}
