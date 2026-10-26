// خواندن جواب ساختاریافته‌ی مدل (بدون server-only تا تست واحد مستقیم اجرایش کند). docs/infoyaarchin.md بخش ۲۹.
export type Decision = { answer: string; source: string; handoff: { reason: string; note?: string } | null };

// JSON جواب مدل (حتی اگر دور آن متن یا ```json آمده باشد)
export function parseDecision(content: string): Decision | null {
  const m = /\{[\s\S]*\}/.exec(content);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Partial<Decision>;
    if (typeof j.answer !== "string" || typeof j.source !== "string") return null;
    const h =
      j.handoff && typeof j.handoff === "object" && typeof j.handoff.reason === "string"
        ? { reason: j.handoff.reason, note: typeof j.handoff.note === "string" ? j.handoff.note.slice(0, 300) : undefined }
        : null;
    if (!["product", "calculator", "knowledge", "general", "none"].includes(j.source)) return null;
    return { answer: j.answer, source: j.source, handoff: h };
  } catch {
    return null;
  }
}
