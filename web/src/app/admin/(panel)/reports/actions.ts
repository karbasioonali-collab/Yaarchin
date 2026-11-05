"use server";
// «تحلیل کن» در کارت «تحلیل هوشمند» گزارش‌ها (بخش ۴۹). فقط با reports.view؛ سوئیچ، داده‌ی کافی و سقف در runInsight.
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ui/ActionForm";
import { requirePermission } from "@/lib/auth/can";
import { resolveRange } from "@/lib/reports/range";
import { runInsight } from "@/lib/reports/insight";

export async function runInsightAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requirePermission("reports.view");
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" && v ? v : undefined;
  };
  const range = resolveRange({ range: s("range"), from: s("from"), to: s("to") });
  if (range.error) return { error: range.error };
  const r = await runInsight({ from: range.from, to: range.to, days: range.days }, { start: range.start, end: range.end }, { start: range.prev.start, end: range.prev.end });
  revalidatePath("/admin/reports");
  return r.ok ? { ok: "تحلیل انجام شد." } : { error: r.error };
}
