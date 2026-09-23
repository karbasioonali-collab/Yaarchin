"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ui/ActionForm";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/can";
import { getAllSettings, setSetting } from "@/lib/settings";
import { toLatinDigits } from "@/lib/validation";

// نوع مقدار جدید از روی نوع مقدار فعلی تعیین می‌شود (boolean / number / {provider, model} / string).
export async function saveSettingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("settings.manage");
  const key = String(fd.get("key") ?? "");
  const current = (await getAllSettings()).find((s) => s.key === key);
  if (!current) return { error: "تنظیم پیدا نشد." };

  let value: unknown;
  const cv = current.value;
  if (typeof cv === "boolean") {
    value = fd.get("value") === "on";
  } else if (typeof cv === "number") {
    const n = Number(toLatinDigits(String(fd.get("value") ?? "")));
    if (!Number.isFinite(n) || n <= 0) return { error: "عدد معتبر وارد کنید." };
    value = n;
  } else if (cv && typeof cv === "object") {
    value = {
      ...(cv as Record<string, unknown>),
      provider: String(fd.get("provider") ?? "").trim(),
      model: String(fd.get("model") ?? "").trim(),
    };
  } else {
    value = String(fd.get("value") ?? "");
  }

  const { before } = await setSetting(key, value, a.user.id);
  await logActivity({ actorUserId: a.user.id, action: "setting.update", entityType: "setting", entityId: key, before, after: value });
  revalidatePath("/admin", "layout");
  return { ok: "ذخیره شد." };
}
