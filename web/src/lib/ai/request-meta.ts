// خواندن meta یک ردیف ai_requests برای نمایش در پنل (بخش ۴۵). خالص.
import type { CallLog } from "./call-log";

export type RequestMetaView = {
  raws: string[];
  calls: CallLog[];
  cleaned: string[];
  handoffNote: string | null;
  blocked: string | null;
  retry: boolean;
  // عددهای مشکوک جواب (بخش ۴۶)
  suspects: string[];
};

const strs = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []);

export function readRequestMeta(meta: unknown): RequestMetaView {
  const m = (meta ?? {}) as Record<string, unknown>;
  return {
    raws: strs(m.raw),
    calls: Array.isArray(m.calls) ? (m.calls.filter((c) => c && typeof c === "object") as CallLog[]) : [],
    cleaned: strs(m.cleaned),
    handoffNote: typeof m.handoffNote === "string" ? m.handoffNote : null,
    blocked: typeof m.blocked === "string" ? m.blocked : null,
    retry: !!m.retry,
    suspects: strs(m.suspectNumbers),
  };
}

const FINISH_FA: Record<string, string> = { stop: "کامل", length: "بریده (سقف توکن)", tool_calls: "ابزار ماشین‌حساب" };
// یک خط خلاصه برای هر تلاش: «اصلی · ۴٫۲ ث · ۸۵۰ → ۱۲۰ توکن · کامل»
export function callLine(c: CallLog): string {
  const parts = [c.which === "fallback" ? "پشتیبان" : "اصلی", `${(Math.round(c.ms / 100) / 10).toLocaleString("fa-IR")} ث`];
  if (c.inTok !== undefined) parts.push(`${(c.inTok ?? 0).toLocaleString("fa-IR")} → ${(c.outTok ?? 0).toLocaleString("fa-IR")} توکن`);
  if (c.error) parts.push(`خطا: ${c.error === "timeout" ? "دیر شد" : c.error}`);
  else if (c.finish) parts.push(FINISH_FA[c.finish] ?? c.finish);
  if (c.reminder) parts.push(c.reminder === "length" ? "بعد از یادآوری «کوتاه‌تر»" : c.reminder === "numbers" ? "بعد از یادآوری «فقط عدد داده‌ها»" : "بعد از یادآوری قالب");
  return parts.join(" · ");
}
