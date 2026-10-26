// امتیازدهی متنی پایگاه دانش (بدون server-only تا تست واحد مستقیم اجرایش کند). docs/infoyaarchin.md بخش ۲۹.
import { tokens } from "./normalize";

type Item = { id: string; question: string; answer: string; variants: string[] | null };

export type KbHit = { id: string; question: string; answer: string; score: number };

export function scoreKb(query: string, items: Item[], limit = 5, min = 3): KbHit[] {
  const q = new Set(tokens(query));
  if (!q.size) return [];
  const hits: KbHit[] = [];
  for (const it of items) {
    const head = new Set(tokens([it.question, ...(it.variants ?? [])].join(" ")));
    const body = new Set(tokens(it.answer));
    let s = 0;
    for (const t of q) {
      if (head.has(t)) s += 3;
      else if (body.has(t)) s += 1;
    }
    // نسبت به طول سؤال مشتری: سؤال کوتاهِ کاملاً منطبق بالاتر از تطابق تصادفی در سؤال بلند
    const score = Math.round((s / Math.max(2, q.size)) * 10);
    if (score >= min) hits.push({ id: it.id, question: it.question, answer: it.answer, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
