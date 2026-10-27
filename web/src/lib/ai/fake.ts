import "server-only";
// «مدل ساختگی» حالت آزمایشی (بدون کلید لیارا). کیفیت جواب را نمی‌سنجد؛ فقط مسیرها را اجرا می‌کند:
// جواب از پایگاه دانش، تعریف عمومی، ماشین‌حساب، ارجاع، محافظ خروجی، خطا و timeout و مدل پشتیبان. هزینه صفر.
// کلمه‌های تست (فقط برای آزمودن مسیرها؛ در پیام مشتری بنویسید):
//   [[leak]]    ← جوابی با اسم یک کارخانه‌ی ثبت‌شده (باید محافظ جلویش را بگیرد)
//   [[timeout]] ← مدل اصلی جواب نمی‌دهد (مسیر مدل پشتیبان)؛ [[down]] ← هر دو مدل خطا ← ارجاع
//   [[badjson]] ← جواب غیر JSON (حتی بعد از یادآوری قالب) ← ارجاع؛ [[badjson1]] ← فقط بار اول غیر JSON (مسیر تلاش دوباره)
//   [[tool]]    ← سؤال قیمت بدون تعداد: مدل ابزار landed_cost را با حداقل سفارش صدا می‌زند (با تعداد، قیمت از قبل در داده‌هاست)
// docs/infoyaarchin.md بخش ۲۹.
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { AiCallError, type ChatMsg, type ModelReply, type ToolCall } from "./client";
import type { SiteContext } from "./context";
import { normFa } from "./normalize";

const GENERAL = /(چیست|چیه|یعنی چه|یعنی چی|تعریف|چه جنسی|چه فرقی)/;

const reply = (content: string | null, toolCalls: ToolCall[] = []): ModelReply => ({
  content,
  toolCalls,
  model: "test/fake",
  finishReason: "stop",
  usage: { promptTokens: 0, completionTokens: 0, costToman: 0 },
});
// همان قالب خطی مدل واقعی (prompt.ts)
const json = (o: { answer: string; source: string; handoff: { reason: string; note?: string } | null }) =>
  reply(`source: ${o.source}\nhandoff: ${o.handoff ? `${o.handoff.reason}${o.handoff.note ? ` | ${o.handoff.note}` : ""}` : "none"}\n---\n${o.answer}`);
const landedAnswer = (t: { available?: boolean; methods?: { method: string; totalToman: number | null }[] }) => {
  if (!t.available) return json({ answer: "", source: "none", handoff: { reason: "no_source", note: "ماشین‌حساب قیمت نداشت" } });
  const lines = (t.methods ?? []).filter((m) => m.totalToman).map((m) => `${m.method}: حدود ${m.totalToman!.toLocaleString("fa-IR")} تومان`);
  return json({ answer: `[آزمایشی] ${lines.join("، ")}. این قیمت تخمینی است.`, source: "calculator", handoff: null });
};

export async function fakeModel(model: "primary" | "fallback", messages: ChatMsg[], ctx: SiteContext): Promise<ModelReply> {
  // پیام مشتری = آخرین پیام user که «داده‌های سایت» دارد (پیام یادآوری قالب، بعد از آن می‌آید)
  // (با «SITE DATA» شروع می‌شود؛ خود یادآوری قالب هم خط --- دارد، پس با آن شناخته نمی‌شود)
  const lastUser = [...messages].reverse().find((m) => m.role === "user" && m.content.startsWith("SITE DATA"));
  const text = normFa(typeof lastUser?.content === "string" ? (lastUser.content.split("\n---\n").pop() ?? "") : "");
  const retried = messages.at(-1)?.role === "user" && messages.at(-1) !== lastUser;
  const toolResult = messages.find((m) => m.role === "tool");
  if (text.includes("[[down]]")) throw new AiCallError("http", "مدل ساختگی: خطای ۵۰۰", 500);
  if (text.includes("[[timeout]]") && model === "primary") throw new AiCallError("timeout", "مدل ساختگی: timeout");
  if (text.includes("[[badjson]]")) return reply("این یک جواب غیر JSON است.");
  if (text.includes("[[badjson1]]") && !retried) return reply("سلام! این بار JSON نیست.");
  if (text.includes("[[leak]]")) {
    const r = await db.execute<{ n: string }>(sql`select name_en as n from companies order by created_at limit 1`);
    const name = r.rows[0]?.n ?? "Sample Factory Co., Ltd";
    return json({ answer: `این محصول را ${name} تولید می‌کند.`, source: "product", handoff: null });
  }
  if (toolResult && toolResult.role === "tool") return landedAnswer(JSON.parse(toolResult.content));
  // تعداد در پیام بود ← قیمت همان تعداد از قبل در داده‌هاست (بدون ابزار)
  if (ctx.landedForQty) return landedAnswer(ctx.landedForQty.result);
  const p = ctx.products[0];
  // سؤال قیمت بدون تعداد ← ابزار (با حداقل سفارش)
  if (p && ctx.withPrice && /\[\[tool\]\]/.test(text)) {
    return reply(null, [{ id: "call_fake_1", type: "function", function: { name: "landed_cost", arguments: JSON.stringify({ product_slug: p.slug, qty: p.moq ?? 100 }) } }]);
  }
  if (ctx.kb[0] && ctx.kb[0].score >= 5) return json({ answer: `[آزمایشی از پایگاه دانش] ${ctx.kb[0].answer}`, source: "knowledge", handoff: null });
  if (GENERAL.test(text)) return json({ answer: "[آزمایشی] تعریف عمومی این مفهوم (بدون نام هیچ منبعی).", source: "general", handoff: null });
  if (p && /(قیمت|حداقل|سفارش|زمان|چقدر|مشخصات)/.test(text)) {
    return json({ answer: `[آزمایشی] ${p.title}: حداقل سفارش ${p.moq ?? "—"}.`, source: "product", handoff: null });
  }
  return json({ answer: "", source: "none", handoff: { reason: "no_source", note: "مدل ساختگی جواب را در داده‌های سایت پیدا نکرد" } });
}
