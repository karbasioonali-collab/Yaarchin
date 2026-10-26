import "server-only";
// صدا زدن مستقیم API سازگار با OpenAI لیارا (POST <AI_BASE_URL>/chat/completions) با fetch؛ بدون کتابخانه (سقف build لیارا).
// - بدون streaming: هر درخواست یک پاسخ کامل؛ اتصال باز طولانی نمی‌ماند (RAM پلن ۵۱۲ مگابایتی).
// - timeout با AbortController. هزینه از usage.total_cost_toman (لیارا خودش برمی‌گرداند)؛ نبود = صفر و فقط توکن.
// - مدل پشتیبان: callModel یک بار با AI_FALLBACK_MODEL دوباره امتحان می‌کند. docs/infoyaarchin.md بخش ۲۹.
import type { AiConfig } from "./config";

export type ChatMsg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type Usage = { promptTokens: number; completionTokens: number; costToman: number };
export type ModelReply = { content: string | null; toolCalls: ToolCall[]; usage: Usage; model: string; finishReason: string | null };

export class AiCallError extends Error {
  constructor(
    public kind: "timeout" | "http" | "network" | "bad_response",
    message: string,
    public status?: number,
    public body?: string,
  ) {
    super(message);
  }
}

export async function chatCompletion(
  cfg: AiConfig,
  model: string,
  req: { messages: ChatMsg[]; tools?: ToolDef[]; toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } }; maxTokens?: number; temperature?: number },
  timeoutMs: number,
): Promise<ModelReply> {
  if (!cfg.baseUrl || !cfg.apiKey) throw new AiCallError("network", "کلید یا آدرس سرویس AI تنظیم نشده است.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model,
        messages: req.messages,
        ...(req.tools?.length ? { tools: req.tools, tool_choice: req.toolChoice ?? "auto" } : {}),
        max_tokens: req.maxTokens ?? 700,
        temperature: req.temperature ?? 0.2,
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === "AbortError") throw new AiCallError("timeout", `پاسخ مدل بیش از ${Math.round(timeoutMs / 1000)} ثانیه طول کشید.`);
    throw new AiCallError("network", `اتصال به سرویس AI ناموفق بود: ${(e as Error).message}`);
  }
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === "AbortError") throw new AiCallError("timeout", "پاسخ مدل دیر رسید.");
    throw new AiCallError("network", "خواندن پاسخ سرویس AI ناموفق بود.");
  }
  clearTimeout(timer);
  if (!res.ok) throw new AiCallError("http", `سرویس AI خطای ${res.status} داد.`, res.status, text.slice(0, 500));
  let j: {
    model?: string;
    choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_cost_toman?: number };
  };
  try {
    j = JSON.parse(text);
  } catch {
    throw new AiCallError("bad_response", "پاسخ سرویس AI قابل خواندن نبود.", res.status, text.slice(0, 300));
  }
  const c = j.choices?.[0];
  if (!c?.message) throw new AiCallError("bad_response", "پاسخ سرویس AI خالی بود.", res.status, text.slice(0, 300));
  return {
    content: c.message.content ?? null,
    toolCalls: Array.isArray(c.message.tool_calls) ? c.message.tool_calls : [],
    model: j.model ?? model,
    finishReason: c.finish_reason ?? null,
    usage: {
      promptTokens: Math.max(0, Math.round(Number(j.usage?.prompt_tokens) || 0)),
      completionTokens: Math.max(0, Math.round(Number(j.usage?.completion_tokens) || 0)),
      costToman: Math.max(0, Number(j.usage?.total_cost_toman) || 0),
    },
  };
}

export const addUsage = (a: Usage, b: Usage): Usage => ({
  promptTokens: a.promptTokens + b.promptTokens,
  completionTokens: a.completionTokens + b.completionTokens,
  costToman: a.costToman + b.costToman,
});
export const ZERO_USAGE: Usage = { promptTokens: 0, completionTokens: 0, costToman: 0 };
