import "server-only";
// «تست اتصال» پنل: با کلید لیارا (حتی وقتی سوئیچ دستیار خاموش است، پس مشتری‌ها درگیر نمی‌شوند) سه چیز را می‌آزماید:
//   ۱. مدل اصلی جواب JSON می‌دهد؛ ۲. Tool calling (ابزار landed_cost) از طریق لیارا کار می‌کند؛ ۳. مدل پشتیبان (اگر تنظیم شده).
// هر درخواست در ai_requests (purpose = connection_test) با توکن و هزینه ثبت می‌شود. docs/infoyaarchin.md بخش ۲۹.
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiRequests, products } from "@/db/schema";
import { AiCallError, chatCompletion, type ChatMsg } from "./client";
import { aiConfig } from "./config";
import { runLandedTool } from "./context";
import { LANDED_TOOL } from "./prompt";

export type TestStep = { name: string; ok: boolean; detail: string; ms: number };

export async function runConnectionTest(): Promise<{ ok: boolean; steps: TestStep[] }> {
  const cfg = aiConfig();
  if (cfg.mode !== "live") return { ok: false, steps: [{ name: "تنظیمات", ok: false, detail: "AI_BASE_URL یا AI_API_KEY در متغیرهای لیارا تعریف نشده است.", ms: 0 }] };
  const steps: TestStep[] = [];
  const log = (model: string, status: string, outcome: string, ms: number, u?: { promptTokens: number; completionTokens: number; costToman: number }, error?: string) =>
    db.insert(aiRequests).values({
      purpose: "connection_test",
      mode: "live",
      model,
      status,
      outcome,
      latencyMs: ms,
      promptTokens: u?.promptTokens ?? 0,
      completionTokens: u?.completionTokens ?? 0,
      costToman: String(u?.costToman ?? 0),
      error: error?.slice(0, 500) ?? null,
    });

  const plain = async (model: string, label: string) => {
    const t = Date.now();
    try {
      const r = await chatCompletion(
        cfg,
        model,
        {
          messages: [
            { role: "system", content: 'فقط این JSON را برگردان: {"ok": true, "lang": "fa"}' },
            { role: "user", content: "تست اتصال" },
          ],
          maxTokens: 50,
        },
        30_000,
      );
      const ok = /"ok"\s*:\s*true/.test(r.content ?? "");
      steps.push({
        name: label,
        ok,
        detail: ok
          ? `جواب درست (${r.model}؛ ${r.usage.promptTokens}+${r.usage.completionTokens} توکن، ${r.usage.costToman.toLocaleString("fa-IR")} تومان)`
          : `جواب غیرمنتظره: ${(r.content ?? "").slice(0, 120)}`,
        ms: Date.now() - t,
      });
      await log(model, ok ? "ok" : "parse_error", label, Date.now() - t, r.usage);
    } catch (e) {
      steps.push({ name: label, ok: false, detail: (e as Error).message + (e instanceof AiCallError && e.body ? ` — ${e.body.slice(0, 160)}` : ""), ms: Date.now() - t });
      await log(model, e instanceof AiCallError && e.kind === "timeout" ? "timeout" : "error", label, Date.now() - t, undefined, (e as Error).message);
    }
  };

  await plain(cfg.model, `مدل اصلی (${cfg.model})`);

  // Tool calling: مدل باید ابزار landed_cost را با slug یک محصول منتشرشده صدا بزند
  const [p] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(and(eq(products.status, "published")))
    .limit(1);
  const t = Date.now();
  if (!p) steps.push({ name: "Tool ماشین‌حساب", ok: false, detail: "هیچ محصول منتشرشده‌ای برای آزمون نیست.", ms: 0 });
  else {
    try {
      const msgs: ChatMsg[] = [
        { role: "system", content: "برای جواب حتماً از ابزار landed_cost استفاده کن." },
        { role: "user", content: `قیمت تمام‌شده‌ی ۱۰۰ عدد از محصول با slug «${p.slug}» چقدر است؟` },
      ];
      const r1 = await chatCompletion(
        cfg,
        cfg.model,
        { messages: msgs, tools: [LANDED_TOOL], toolChoice: { type: "function", function: { name: "landed_cost" } }, maxTokens: 200 },
        30_000,
      );
      const call = r1.toolCalls.find((c) => c.function.name === "landed_cost");
      if (!call) {
        steps.push({
          name: "Tool ماشین‌حساب",
          ok: false,
          detail: `مدل ابزار را صدا نزد (جواب: ${(r1.content ?? "").slice(0, 100)}). دستیار از روش جایگزین (محاسبه در کد) استفاده می‌کند.`,
          ms: Date.now() - t,
        });
        await log(cfg.model, "parse_error", "tool", Date.now() - t, r1.usage);
      } else {
        const args = JSON.parse(call.function.arguments || "{}");
        const result = await runLandedTool(args);
        msgs.push({ role: "assistant", content: r1.content ?? null, tool_calls: [call] }, { role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        const r2 = await chatCompletion(cfg, cfg.model, { messages: msgs, tools: [LANDED_TOOL], maxTokens: 300 }, 30_000);
        const ok = !!(r2.content ?? "").trim();
        steps.push({
          name: "Tool ماشین‌حساب",
          ok,
          detail: ok ? `ابزار با ${JSON.stringify(args)} صدا زده شد و مدل از نتیجه جواب ساخت.` : "ابزار صدا زده شد ولی جواب نهایی خالی بود.",
          ms: Date.now() - t,
        });
        await log(cfg.model, ok ? "ok" : "parse_error", "tool", Date.now() - t, {
          promptTokens: r1.usage.promptTokens + r2.usage.promptTokens,
          completionTokens: r1.usage.completionTokens + r2.usage.completionTokens,
          costToman: r1.usage.costToman + r2.usage.costToman,
        });
      }
    } catch (e) {
      steps.push({
        name: "Tool ماشین‌حساب",
        ok: false,
        detail: (e as Error).message + (e instanceof AiCallError && e.body ? ` — ${e.body.slice(0, 160)}` : ""),
        ms: Date.now() - t,
      });
      await log(cfg.model, "error", "tool", Date.now() - t, undefined, (e as Error).message);
    }
  }

  if (cfg.fallbackModel) await plain(cfg.fallbackModel, `مدل پشتیبان (${cfg.fallbackModel})`);
  return { ok: steps.every((s) => s.ok), steps };
}
