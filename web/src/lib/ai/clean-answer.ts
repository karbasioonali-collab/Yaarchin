// پاک‌کننده‌ی متن جواب دستیار قبل از رسیدن به مشتری (بخش ۴۴). خالص؛ تست واحد مستقیم اجرایش می‌کند.
// چت متن ساده است (ChatThread بدنه را خام نشان می‌دهد)، پس:
//   ۱. هر خط یا پرانتزی که اثری از بخش‌های داخلی دارد کامل حذف می‌شود (نه فقط کلمه):
//      signals، qty=، budget=، import=، channel=، handoff:، source:، «یادداشت … کارشناس»، note for staff / internal note
//   ۲. خط تمام‌انگلیسی با ۴ کلمه یا بیشتر (متن دستورالعمل‌مانند) حذف می‌شود؛ اسم انگلیسی کوتاه داخل جمله‌ی فارسی می‌ماند
//   ۳. تکه‌های جامانده‌ی نشانه‌ها با stripSignals
//   ۴. Markdown: ** و __ و ` و # اول خط
// tooShort = پاک‌کننده چیزی برداشت و جواب تقریباً خالی ماند ← مثل جواب ناخوانا (یک بار تلاش دوباره، بعد ارجاع)
import { stripSignals } from "../leads/signals";

const INTERNAL =
  /signals?|\b(qty|budget|import|channel)\s*=|\b(handoff|source)\s*[:：]|note\s+for\s+(the\s+)?(staff|expert|team)|(staff|internal|expert)\s+note|یادداشت[^\n]{0,40}(کارشناس|داخلی)|برای کارشناس[^\n]{0,10}[:：]/i;
const PERSIAN = /[؀-ۿ]/;
const LATIN_WORD = /[A-Za-z][A-Za-z'’-]*/g;

export type CleanResult = { text: string; removed: string[]; leaked: boolean; tooShort: boolean };

export function cleanAnswer(answer: string): CleanResult {
  const removed: string[] = [];
  let text = answer.replace(/\r/g, "");
  // پرانتز یا کروشه‌ای که اشاره‌ی داخلی دارد
  text = text.replace(/[(\[（][^()\[\]（）\n]*[)\]）]/g, (m) => {
    if (!INTERNAL.test(m)) return m;
    removed.push(m);
    return "";
  });
  const lines = text.split("\n").filter((l) => {
    const t = l.trim();
    if (!t) return true;
    if (INTERNAL.test(t)) return void removed.push(t);
    if (!PERSIAN.test(t) && (t.match(LATIN_WORD) ?? []).length >= 4) return void removed.push(t);
    return true;
  });
  const s = stripSignals(lines.join("\n"));
  text = s.text
    .replace(/\*\*|__|`/g, "")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const changed = removed.length > 0 || s.leaked;
  return { text, removed, leaked: changed, tooShort: answer.trim() !== "" && changed && letters < 10 };
}
