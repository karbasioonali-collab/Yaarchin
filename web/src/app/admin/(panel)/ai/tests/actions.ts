"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/ui/ActionForm";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/can";
import { HANDOFF_FA } from "@/lib/ai/rules";
import { type CaseInput, markCaseReviewed, saveCase, setVerdict } from "@/lib/ai/test-cases";
import { SOURCES } from "@/lib/ai/decision";
import { createRun, executeRun, requestStop, type Scope, type ScopeKind, SCOPE_FA } from "@/lib/ai/tests";
import { aiTestsReady } from "@/lib/db-ready";

// نوشتنی‌های «آزمون دستیار» (ai.tests). docs/infoyaarchin.md بخش ۳۳.
const NOT_READY = "آزمون دستیار بعد از اجرای migration ۰۰۱۱ فعال می‌شود (در کنسول لیارا npm run db:migrate).";
const UUID = /^[0-9a-f-]{36}$/i;
const lines = (v: FormDataEntryValue | null) => [
  ...new Set(
    String(v ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];
const HANDOFF_OPTS = new Set(["none", "any", ...Object.keys(HANDOFF_FA)]);
const SOURCE_OPTS = new Set<string>([...SOURCES.filter((s) => s !== "none"), "canned"]);

function readCase(fd: FormData): { v: CaseInput } | { error: string } {
  const question = String(fd.get("question") ?? "")
    .trim()
    .slice(0, 1000);
  if (question.length < 2) return { error: "سؤال را بنویسید." };
  const category = String(fd.get("category"));
  if (category !== "normal" && category !== "tricky" && category !== "handoff") return { error: "دسته نامعتبر است." };
  const handoff = String(fd.get("handoff") ?? "");
  if (handoff && !HANDOFF_OPTS.has(handoff)) return { error: "ارجاع مورد انتظار نامعتبر است." };
  const sources = String(fd.get("source") ?? "")
    .split(/[|،,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const badSrc = sources.find((s) => !SOURCE_OPTS.has(s));
  if (badSrc) return { error: `منبع «${badSrc}» نامعتبر است (product، calculator، knowledge، general یا canned؛ چند گزینه با |).` };
  const slug = String(fd.get("productSlug") ?? "")
    .trim()
    .toLowerCase();
  if (slug && !/^[a-z0-9-]{1,120}$/.test(slug)) return { error: "slug محصول نامعتبر است." };
  return {
    v: {
      question,
      expectedAnswer: String(fd.get("expectedAnswer") ?? "")
        .trim()
        .slice(0, 2000),
      category,
      productSlug: slug || null,
      expect: {
        handoff: handoff || null,
        source: sources.length ? [...new Set(sources)].join("|") : null,
        forbidden: lines(fd.get("forbidden"))
          .slice(0, 30)
          .map((s) => s.slice(0, 100)),
        mustInclude: lines(fd.get("mustInclude"))
          .slice(0, 30)
          .map((s) => s.slice(0, 100)),
      },
      status: fd.get("status") === "draft" ? "draft" : "active",
    },
  };
}

export async function saveCaseAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("ai.tests");
  if (!(await aiTestsReady())) return { error: NOT_READY };
  const id = String(fd.get("id") ?? "");
  if (id && !UUID.test(id)) return { error: "سؤال نامعتبر است." };
  const r = readCase(fd);
  if ("error" in r) return r;
  const out = await saveCase(id || null, r.v, a.user.id);
  if (out.changed)
    await logActivity({
      actorUserId: a.user.id,
      actingAsUserId: a.session.impersonatingUserId,
      action: id ? "ai_test.update" : "ai_test.create",
      entityType: "ai_test_case",
      entityId: out.id,
      after: r.v,
    });
  revalidatePath("/admin/ai/tests", "layout");
  return { ok: out.changed ? "ذخیره شد." : "بدون تغییر." };
}

export async function reviewCaseAction(fd: FormData): Promise<void> {
  const a = await requirePermission("ai.tests");
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id) || !(await aiTestsReady())) return;
  if (await markCaseReviewed(id, a.user.id)) await logActivity({ actorUserId: a.user.id, action: "ai_test.review", entityType: "ai_test_case", entityId: id });
  revalidatePath("/admin", "layout");
}

// «تأیید و اجرا» از صفحه‌ی تأیید (هزینه‌ی تخمینی دیده شده)؛ اجرا در پس‌زمینه
export async function startRunAction(fd: FormData): Promise<void> {
  const a = await requirePermission("ai.tests");
  if (!(await aiTestsReady())) return;
  const kind = String(fd.get("scope") ?? "") as ScopeKind;
  if (!(kind in SCOPE_FA)) return;
  const scope: Scope = { kind, ids: kind === "selected" ? fd.getAll("ids").map(String) : undefined };
  const r = await createRun(scope, a.user.id);
  if ("error" in r) redirect(`/admin/ai/tests/confirm?${new URLSearchParams([["scope", kind], ...(scope.ids ?? []).map((x) => ["ids", x]), ["error", r.error]])}`);
  await logActivity({ actorUserId: a.user.id, action: "ai_test.run", entityType: "ai_test_run", entityId: r.id, after: { scope: kind, count: scope.ids?.length } });
  after(() => executeRun(r.id));
  redirect(`/admin/ai/tests/runs/${r.id}`);
}

export async function stopRunAction(fd: FormData): Promise<void> {
  const a = await requirePermission("ai.tests");
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id) || !(await aiTestsReady())) return;
  if (await requestStop(id)) await logActivity({ actorUserId: a.user.id, action: "ai_test.stop", entityType: "ai_test_run", entityId: id });
  revalidatePath(`/admin/ai/tests/runs/${id}`);
}

export async function verdictAction(fd: FormData): Promise<void> {
  const a = await requirePermission("ai.tests");
  const id = Number(fd.get("resultId"));
  const verdict = fd.get("verdict") === "wrong" ? "wrong" : fd.get("verdict") === "correct" ? "correct" : null;
  if (!Number.isInteger(id) || !verdict || !(await aiTestsReady())) return;
  const r = await setVerdict(id, verdict, a.user.id);
  if (r) {
    await logActivity({ actorUserId: a.user.id, action: "ai_test.verdict", entityType: "ai_test_result", entityId: String(id), after: { verdict } });
    revalidatePath(`/admin/ai/tests/runs/${r.runId}`);
  }
}
