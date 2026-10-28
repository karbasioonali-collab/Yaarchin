"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ui/ActionForm";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/can";
import { runConnectionTest, type TestStep } from "@/lib/ai/connection-test";
import { CANNED_DEFAULTS } from "@/lib/ai/canned";
import { DEFAULT_GENERIC_WORDS } from "@/lib/ai/context-shape";
import { clearBlacklistCache } from "@/lib/ai/guard-terms";
import { type KbInput, markReviewed, saveKb } from "@/lib/ai/kb";
import { CURRENCY_ERROR, hasCurrencyAmount } from "@/lib/ai/learn";
import { aiReady } from "@/lib/db-ready";
import { getSetting, setSetting } from "@/lib/settings";
import { toLatinDigits } from "@/lib/validation";

// نوشتنی‌های بخش «دستیار هوشمند». docs/infoyaarchin.md بخش ۲۹.
const NOT_READY = "این بخش بعد از اجرای migration ۰۰۱۰ فعال می‌شود (در کنسول لیارا npm run db:migrate).";
const UUID = /^[0-9a-f-]{36}$/i;

const LIMITS: [string, string, number, number][] = [
  ["ai.max_replies_per_chat", "maxReplies", 1, 200],
  ["ai.customer_daily_messages", "customerDaily", 1, 2000],
  ["ai.daily_requests", "dailyRequests", 1, 1_000_000],
  ["ai.daily_cost_toman", "dailyCost", 0, 1_000_000_000],
  ["ai.big_order_qty", "bigOrder", 1, 100_000_000],
  ["ai.lead_score_handoff", "leadScore", 1, 100000],
  ["ai.resume_after_hours", "resumeHours", 0, 24 * 365],
  ["ai.kb_review_days", "reviewDays", 1, 3650],
  // آزمون دستیار (بخش ۳۳)؛ جدا از سقف چت مشتری
  ["ai.test_daily_cost_toman", "testDailyCost", 0, 1_000_000_000],
  ["ai.test_stale_days", "testStaleDays", 1, 3650],
];

export async function saveAiLimitsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("ai.settings");
  const values: [string, number][] = [];
  for (const [key, field, min, max] of LIMITS) {
    const n = Number(
      toLatinDigits(String(fd.get(field) ?? ""))
        .replace(/[,٬]/g, "")
        .trim(),
    );
    if (!Number.isInteger(n) || n < min || n > max) return { error: `مقدار «${field}» باید عدد صحیح بین ${min.toLocaleString("fa-IR")} و ${max.toLocaleString("fa-IR")} باشد.` };
    values.push([key, n]);
  }
  // تنظیمی که seed هنوز نساخته (مثلاً سقف آزمون قبل از npm run db:seed) رد می‌شود و بقیه ذخیره می‌شوند
  const missing: string[] = [];
  for (const [key, n] of values) {
    const r = await setSetting(key, n, a.user.id).catch(() => null);
    if (!r) {
      missing.push(key);
      continue;
    }
    const before = r.before;
    if (before !== n)
      await logActivity({
        actorUserId: a.user.id,
        actingAsUserId: a.session.impersonatingUserId,
        action: "setting.update",
        entityType: "setting",
        entityId: key,
        before: { value: before },
        after: { value: n },
      });
  }
  revalidatePath("/admin", "layout");
  if (missing.length) return { error: `بقیه ذخیره شد، ولی ${missing.join("، ")} هنوز در دیتابیس نیست؛ اول در کنسول لیارا npm run db:seed را اجرا کنید.` };
  return { ok: "ذخیره شد." };
}

export async function saveBlacklistAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("ai.settings");
  const list = [
    ...new Set(
      String(fd.get("terms") ?? "")
        .split(/\n/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2),
    ),
  ].slice(0, 2000);
  const before = (await getSetting<string[]>("ai.blacklist")) ?? [];
  await setSetting("ai.blacklist", list, a.user.id);
  clearBlacklistCache();
  await logActivity({
    actorUserId: a.user.id,
    actingAsUserId: a.session.impersonatingUserId,
    action: "setting.update",
    entityType: "setting",
    entityId: "ai.blacklist",
    before: { count: before.length },
    after: { count: list.length, value: list },
  });
  revalidatePath("/admin/ai");
  return { ok: `ذخیره شد (${list.length.toLocaleString("fa-IR")} کلمه).` };
}

// «کلمه‌های کلی» عنوان محصول (بخش ۳۴): اسم اصلی کالا حساب نمی‌شوند. خالی = پیش‌فرض.
export async function saveGenericWordsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("ai.settings");
  const list = [
    ...new Set(
      String(fd.get("words") ?? "")
        .split(/[\n،,]/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2 && s.length <= 40),
    ),
  ].slice(0, 200);
  const value = list.length ? list : DEFAULT_GENERIC_WORDS;
  const r = await setSetting("ai.product_generic_words", value, a.user.id).catch(() => null);
  if (!r) return { error: "این تنظیم هنوز در دیتابیس نیست؛ اول در کنسول لیارا npm run db:seed را اجرا کنید." };
  await logActivity({
    actorUserId: a.user.id,
    actingAsUserId: a.session.impersonatingUserId,
    action: "setting.update",
    entityType: "setting",
    entityId: "ai.product_generic_words",
    before: { value: r.before },
    after: { value },
  });
  revalidatePath("/admin/ai");
  return { ok: `ذخیره شد (${value.length.toLocaleString("fa-IR")} کلمه).` };
}

// جواب‌های آماده‌ی احوال‌پرسی، تشکر و خداحافظی (docs/infoyaarchin.md بخش ۳۱). خالی = متن پیش‌فرض.
const CANNED_FORM: [keyof typeof CANNED_DEFAULTS, string][] = [
  ["ai.reply_greeting_product", "greetingProduct"],
  ["ai.reply_greeting_general", "greetingGeneral"],
  ["ai.reply_thanks", "thanks"],
  ["ai.reply_bye", "bye"],
];

export async function saveCannedAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("ai.settings");
  const values = CANNED_FORM.map(
    ([key, field]) =>
      [
        key,
        String(fd.get(field) ?? "")
          .trim()
          .slice(0, 600) || CANNED_DEFAULTS[key],
      ] as const,
  );
  try {
    for (const [key, v] of values) {
      const { before } = await setSetting(key, v, a.user.id);
      if (before !== v)
        await logActivity({
          actorUserId: a.user.id,
          actingAsUserId: a.session.impersonatingUserId,
          action: "setting.update",
          entityType: "setting",
          entityId: key,
          before: { value: before },
          after: { value: v },
        });
    }
  } catch {
    return { error: "این تنظیم‌ها هنوز در دیتابیس نیستند؛ اول در کنسول لیارا npm run db:seed را اجرا کنید." };
  }
  revalidatePath("/admin/ai");
  return { ok: "ذخیره شد." };
}

export async function connectionTestAction(): Promise<{ ok: boolean; steps: TestStep[] } | { error: string }> {
  const a = await requirePermission("ai.settings");
  if (!(await aiReady())) return { error: NOT_READY };
  const r = await runConnectionTest();
  await logActivity({ actorUserId: a.user.id, action: "ai.connection_test", entityType: "ai", after: { ok: r.ok, steps: r.steps.map((s) => ({ name: s.name, ok: s.ok })) } });
  revalidatePath("/admin/ai");
  return r;
}

// ---------- پایگاه دانش (ai.knowledge) ----------
function readKb(fd: FormData): { v: KbInput } | { error: string } {
  const question = String(fd.get("question") ?? "")
    .trim()
    .slice(0, 500);
  const answer = String(fd.get("answer") ?? "")
    .trim()
    .slice(0, 4000);
  const variants = [
    ...new Set(
      String(fd.get("variants") ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ]
    .slice(0, 30)
    .map((s) => s.slice(0, 300));
  const category =
    String(fd.get("category") ?? "")
      .trim()
      .slice(0, 100) || null;
  const status = fd.get("status") === "active" ? "active" : "draft";
  if (question.length < 3) return { error: "سؤال را بنویسید." };
  if (answer.length < 2) return { error: "جواب را بنویسید." };
  if (status === "active" && /\[تکمیل شود/.test(answer)) return { error: "جواب هنوز «[تکمیل شود]» دارد؛ اول کاملش کنید یا وضعیت را «پیش‌نویس» بگذارید." };
  // مبلغ در جواب پایگاه دانش ممنوع (قیمت از داده‌های سایت و ماشین‌حساب؛ بخش ۳۳)
  if (hasCurrencyAmount(answer)) return { error: CURRENCY_ERROR };
  return { v: { question, answer, variants, category, status } };
}

export async function saveKbAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("ai.knowledge");
  if (!(await aiReady())) return { error: NOT_READY };
  const id = String(fd.get("id") ?? "");
  if (id && !UUID.test(id)) return { error: "مورد نامعتبر است." };
  const r = readKb(fd);
  if ("error" in r) return r;
  const out = await saveKb(id || null, r.v, a.user.id);
  if (out.changed)
    await logActivity({
      actorUserId: a.user.id,
      actingAsUserId: a.session.impersonatingUserId,
      action: id ? "kb.update" : "kb.create",
      entityType: "kb_item",
      entityId: out.id,
      after: r.v,
    });
  revalidatePath("/admin/ai/knowledge", "layout");
  return { ok: out.changed ? "ذخیره شد." : "بدون تغییر." };
}

export async function reviewKbAction(fd: FormData): Promise<void> {
  const a = await requirePermission("ai.knowledge");
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id) || !(await aiReady())) return;
  if (await markReviewed(id, a.user.id)) await logActivity({ actorUserId: a.user.id, action: "kb.review", entityType: "kb_item", entityId: id });
  revalidatePath("/admin", "layout");
}
