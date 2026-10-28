"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { aiSuggestions } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireAnyPermission, requirePermission } from "@/lib/auth/can";
import { saveKb } from "@/lib/ai/kb";
import { closeSuggestions } from "@/lib/ai/suggestions";
import { saveCase } from "@/lib/ai/test-cases";
import { EMPTY_EXPECT } from "@/lib/ai/test-checks";
import { suggestTricky } from "@/lib/ai/tricky";
import { aiTestsReady } from "@/lib/db-ready";

// «پیشنهاد سؤال تازه»: تبدیل یک‌کلیکی به مورد پایگاه دانش (پیش‌نویس؛ جواب را انسان می‌نویسد) یا سؤال آزمون (پیش‌نویس)، یا رد کردن.
// با هر کدام، همه‌ی ردیف‌های باز همان سؤال بسته می‌شوند. هیچ‌چیز خودکار نیست. docs/infoyaarchin.md بخش ۳۳.
const UUID = /^[0-9a-f-]{36}$/i;

async function load(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id) || !(await aiTestsReady())) return null;
  const [s] = await db.select().from(aiSuggestions).where(eq(aiSuggestions.id, id));
  return s ?? null;
}

export async function suggestionToKbAction(fd: FormData): Promise<void> {
  const a = await requirePermission("ai.knowledge");
  const s = await load(fd);
  if (!s || s.status !== "open") return;
  const kb = await saveKb(null, { question: s.question.slice(0, 500), answer: "[تکمیل شود]", variants: [], category: null, status: "draft" }, a.user.id);
  await closeSuggestions(s.questionKey, "kb", a.user.id, kb.id);
  await logActivity({ actorUserId: a.user.id, action: "ai_suggestion.to_kb", entityType: "ai_suggestion", entityId: s.id, after: { kbItemId: kb.id, question: s.question } });
  revalidatePath("/admin", "layout");
  redirect(`/admin/ai/knowledge/${kb.id}`);
}

export async function suggestionToTestAction(fd: FormData): Promise<void> {
  const a = await requirePermission("ai.tests");
  const s = await load(fd);
  if (!s || s.status !== "open") return;
  // پیش‌فرض‌ها از نوع پیشنهاد؛ انتظارها را انسان کامل می‌کند
  const category = s.kind === "leak" || s.kind === "ai_tricky" || s.kind === "rule_gap" ? "tricky" : s.kind === "handoff" ? "handoff" : "normal";
  const handoff = s.kind === "rule_gap" ? ((s.detail ?? "").match(/^[a-z_]+/)?.[0] ?? "any") : s.kind === "ai_tricky" || s.kind === "leak" ? "any" : null;
  const c = await saveCase(
    null,
    { question: s.question, expectedAnswer: "", category, productSlug: null, expect: { ...EMPTY_EXPECT, handoff }, status: "draft" },
    a.user.id,
    "suggestion",
  );
  await closeSuggestions(s.questionKey, "test", a.user.id, c.id);
  await logActivity({ actorUserId: a.user.id, action: "ai_suggestion.to_test", entityType: "ai_suggestion", entityId: s.id, after: { testCaseId: c.id, question: s.question } });
  revalidatePath("/admin", "layout");
  redirect(`/admin/ai/tests/${c.id}`);
}

export async function dismissSuggestionAction(fd: FormData): Promise<void> {
  const a = await requireAnyPermission(["ai.knowledge", "ai.tests"]);
  const s = await load(fd);
  if (!s || s.status !== "open") return;
  const n = await closeSuggestions(s.questionKey, "dismissed", a.user.id, null);
  await logActivity({ actorUserId: a.user.id, action: "ai_suggestion.dismiss", entityType: "ai_suggestion", entityId: s.id, after: { question: s.question, rows: n } });
  revalidatePath("/admin", "layout");
}

export async function trickyAction(): Promise<FormState> {
  const a = await requirePermission("ai.tests");
  if (!(await aiTestsReady())) return { error: "بعد از اجرای migration ۰۰۱۱." };
  const r = await suggestTricky();
  if ("error" in r) return r;
  await logActivity({ actorUserId: a.user.id, action: "ai_suggestion.tricky", entityType: "ai", after: r });
  revalidatePath("/admin/ai/suggestions");
  return { ok: `${r.added.toLocaleString("fa-IR")} سؤال تازه اضافه شد${r.costToman ? ` (هزینه ${Math.round(r.costToman).toLocaleString("fa-IR")} تومان)` : ""}.` };
}
