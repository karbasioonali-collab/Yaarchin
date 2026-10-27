// خواندن جواب ساختاریافته‌ی مدل (بدون server-only تا تست واحد مستقیم اجرایش کند). docs/infoyaarchin.md بخش ۲۹، ۳۱ و ۳۲.
// قالب اصلی از نسخه‌ی 2026-10-28 «خطی» است (prompt.ts):
//   source: product
//   handoff: none            (یا: handoff: no_source | یادداشت برای کارشناس)
//   ---
//   <جواب فارسی>
// JSON قدیمی هم هنوز پذیرفته می‌شود (پایین‌تر).
// مقاوم در برابر قالب‌های رایج مدل‌ها، بدون شل کردن قاعده‌ها (منبع ناشناخته همچنان نامعتبر است):
//   ```json … ``` و متن قبل یا بعد از JSON؛ چند شیء پشت هم (اولین شیء معتبر)؛ «}» داخل متن جواب؛
//   شکستن خط یا tab خام داخل رشته (JSON.parse آن را نمی‌پذیرد)؛ اسم دیگر فیلد جواب (reply/response/text/message)؛
//   handoff به‌شکل رشته‌ی "null" یا فقط اسم دلیل.
export type Decision = { answer: string; source: string; handoff: { reason: string; note?: string } | null };

export const SOURCES = ["product", "calculator", "knowledge", "general", "none"] as const;

// همه‌ی شیءهای کامل {…} سطح بالا در متن (با شمردن آکولاد و نادیده گرفتن آکولادِ داخل رشته)
export function jsonObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      if (depth > 0) inStr = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0) out.push(text.slice(start, i + 1));
    }
  }
  return out;
}

// کاراکترهای کنترلی خام داخل رشته‌های JSON ← escape
export function escapeControlInStrings(s: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      else if (ch === "\n") {
        out += "\\n";
        continue;
      } else if (ch === "\r") continue;
      else if (ch === "\t") {
        out += "\\t";
        continue;
      }
    } else if (ch === '"') inStr = true;
    out += ch;
  }
  return out;
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {}
  try {
    return JSON.parse(escapeControlInStrings(s));
  } catch {
    return undefined;
  }
}

function toDecision(j: unknown): Decision | null {
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  const answerRaw = ["answer", "reply", "response", "text", "message"].map((k) => o[k]).find((v) => typeof v === "string");
  const source = typeof o.source === "string" ? o.source.trim().toLowerCase() : null;
  if (typeof answerRaw !== "string" || !source || !(SOURCES as readonly string[]).includes(source)) return null;
  let h: Decision["handoff"] = null;
  const hr = o.handoff;
  if (hr && typeof hr === "object" && typeof (hr as { reason?: unknown }).reason === "string") {
    const x = hr as { reason: string; note?: unknown };
    h = { reason: x.reason.trim().toLowerCase(), note: typeof x.note === "string" ? x.note.slice(0, 300) : undefined };
  } else if (typeof hr === "string" && hr.trim() && !/^(null|none|false|)$/i.test(hr.trim())) {
    h = { reason: hr.trim().toLowerCase() };
  }
  return { answer: answerRaw, source, handoff: h };
}

const NO_HANDOFF = /^(none|null|no|false|-|—|)$/i;

// قالب خطی. منبع ناشناخته همچنان نامعتبر است (قاعده‌ها شل نمی‌شوند).
export function parseLines(content: string): Decision | null {
  const text = content.replace(/```[a-z]*\n?/gi, "").replace(/\r/g, "");
  const lines = text.split("\n");
  const si = lines.findIndex((l) => /^\s*\**\s*source\s*\**\s*[:：]/i.test(l));
  if (si < 0) return null;
  const source = lines[si]
    .replace(/^[^:：]*[:：]/, "")
    .replace(/[*`"']/g, "")
    .trim()
    .toLowerCase();
  if (!(SOURCES as readonly string[]).includes(source)) return null;
  let handoff: Decision["handoff"] = null;
  let end = si;
  const hi = lines.findIndex((l, i) => i > si && i <= si + 3 && /^\s*\**\s*handoff\s*\**\s*[:：]/i.test(l));
  if (hi >= 0) {
    end = hi;
    const [reasonRaw, ...noteParts] = lines[hi].replace(/^[^:：]*[:：]/, "").split("|");
    const reason = reasonRaw
      .replace(/[*`"']/g, "")
      .trim()
      .toLowerCase();
    if (!NO_HANDOFF.test(reason)) handoff = { reason, note: noteParts.join("|").trim().slice(0, 300) || undefined };
  }
  // متن جواب: بعد از خط --- (اگر نبود، بعد از خط‌های سرآیند)
  const sep = lines.findIndex((l, i) => i > end && /^\s*-{3,}\s*$/.test(l));
  const body = lines
    .slice(sep >= 0 ? sep + 1 : end + 1)
    .join("\n")
    .replace(/^\s*(answer|reply)\s*[:：]\s*/i, "")
    .trim();
  return { answer: body, source, handoff };
}

export function parseDecision(content: string): Decision | null {
  const lined = parseLines(content);
  if (lined) return lined;
  const text = content.replace(/```(?:json|JSON)?/g, " ");
  for (const obj of jsonObjects(text)) {
    const d = toDecision(tryParse(obj));
    if (d) return d;
  }
  return null;
}

// یادآوری قالب برای تلاش دوباره (agent.ts)؛ حالا باید بسیار نادر باشد
export const FORMAT_REMINDER = `Your previous reply did not follow the output format. Send the same reply again in exactly this format, with no JSON and no code fences:
source: <product|calculator|knowledge|general|none>
handoff: <none|restricted|no_source|complaint|discount|final_price|proforma|big_order|other> | <optional note>
---
<reply in Persian>
source must be one of those five values (general for a greeting or a general definition).`;
