"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { LEAD_RULE_KINDS, leadScoreRules } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/can";
import { reportsReady } from "@/lib/db-ready";
import { toLatinDigits } from "@/lib/validation";

// ویرایش قانون‌های امتیاز جدیت (settings.manage). docs/infoyaarchin.md بخش ۲۸. هر تغییر در لاگ فعالیت (lead_rule.*).
const UUID = /^[0-9a-f-]{36}$/i;
const NOT_READY = "این بخش بعد از اجرای migration ۰۰۰۹ فعال می‌شود (در کنسول لیارا npm run db:migrate).";
const numIn = (fd: FormData, k: string) => {
  const s = toLatinDigits(String(fd.get(k) ?? ""))
    .trim()
    .replace("٫", ".");
  return s === "" ? null : Number(s);
};

function read(fd: FormData) {
  const labelFa = String(fd.get("labelFa") ?? "")
    .trim()
    .slice(0, 120);
  const points = numIn(fd, "points");
  const cap = numIn(fd, "cap");
  const windowDays = numIn(fd, "windowDays");
  if (labelFa.length < 2) return { error: "اسم قانون را بنویسید." } as const;
  if (points === null || !Number.isFinite(points) || points < 0 || points > 10000) return { error: "امتیاز هر واحد باید عدد ۰ تا ۱۰٬۰۰۰ باشد." } as const;
  if (cap !== null && (!Number.isFinite(cap) || cap < 0 || cap > 100000)) return { error: "سقف باید عدد مثبت باشد (یا خالی = بدون سقف)." } as const;
  if (windowDays !== null && (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 3650))
    return { error: "بازه‌ی روز باید عدد صحیح ۱ تا ۳۶۵۰ باشد (یا خالی = همه‌ی زمان‌ها)." } as const;
  return { v: { labelFa, points: String(points), cap: cap === null ? null : String(cap), windowDays, enabled: fd.get("enabled") === "on" } } as const;
}

export async function updateRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("settings.manage");
  if (!(await reportsReady())) return { error: NOT_READY };
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return { error: "قانون نامعتبر است." };
  const r = read(fd);
  if ("error" in r) return r;
  const [before] = await db.select().from(leadScoreRules).where(eq(leadScoreRules.id, id));
  if (!before) return { error: "قانون پیدا نشد." };
  await db
    .update(leadScoreRules)
    .set({ ...r.v, updatedBy: a.user.id })
    .where(eq(leadScoreRules.id, id));
  await logActivity({
    actorUserId: a.user.id,
    actingAsUserId: a.session.impersonatingUserId,
    action: "lead_rule.update",
    entityType: "lead_rule",
    entityId: id,
    before: { labelFa: before.labelFa, points: before.points, cap: before.cap, windowDays: before.windowDays, enabled: before.enabled },
    after: r.v,
  });
  revalidatePath("/admin", "layout");
  return { ok: "ذخیره شد." };
}

export async function createRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("settings.manage");
  if (!(await reportsReady())) return { error: NOT_READY };
  const kind = String(fd.get("kind") ?? "");
  if (!(LEAD_RULE_KINDS as readonly string[]).includes(kind)) return { error: "نوع قانون نامعتبر است." };
  const r = read(fd);
  if ("error" in r) return r;
  const signal = String(fd.get("signal") ?? "").trim();
  if (kind === "signal" && !/^[a-z][a-z0-9_]{1,40}$/.test(signal)) return { error: "کلید نشانه فقط حروف کوچک انگلیسی، عدد و _ (مثل orders_count)." };
  const key = `${kind}_${Date.now().toString(36)}`;
  const [row] = await db
    .insert(leadScoreRules)
    .values({ key, kind, ...r.v, params: kind === "signal" ? { signal } : {}, sortOrder: 100, source: "admin", updatedBy: a.user.id })
    .returning({ id: leadScoreRules.id });
  await logActivity({
    actorUserId: a.user.id,
    actingAsUserId: a.session.impersonatingUserId,
    action: "lead_rule.create",
    entityType: "lead_rule",
    entityId: row.id,
    after: { key, kind, signal, ...r.v },
  });
  revalidatePath("/admin", "layout");
  return { ok: "قانون اضافه شد." };
}

// فقط قانون‌های ساخته‌شده در پنل حذف می‌شوند؛ پیش‌فرض‌ها خاموش می‌شوند (seed دوباره نمی‌سازدشان، ولی تاریخچه روشن می‌ماند)
export async function deleteRuleAction(fd: FormData): Promise<void> {
  const a = await requirePermission("settings.manage");
  if (!(await reportsReady())) return;
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const [before] = await db.select().from(leadScoreRules).where(eq(leadScoreRules.id, id));
  if (!before || before.source === "system") return;
  await db.delete(leadScoreRules).where(eq(leadScoreRules.id, id));
  await logActivity({ actorUserId: a.user.id, actingAsUserId: a.session.impersonatingUserId, action: "lead_rule.delete", entityType: "lead_rule", entityId: id, before });
  revalidatePath("/admin", "layout");
}
