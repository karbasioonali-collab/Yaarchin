// سرور ساختگی سازگار با OpenAI (مثل API هوش مصنوعی لیارا) فقط برای تست e2e محلی «حالت زنده»ی دستیار.
// اجرا: node tests/e2e/mock-ai.mjs [port]  ← سرور با AI_BASE_URL=http://127.0.0.1:<port>/v1 AI_API_KEY=test
// رفتار با کلمه‌های داخل پیام مشتری (بخش بعد از «\n---\n» آخرین پیام user):
//   [[tool]] ← اول ابزار landed_cost (slug از داده‌های سایت)، بعد جواب از نتیجه‌ی ابزار
//   [[leak:X]] ← جوابی که X را دارد (محافظ باید جلویش را بگیرد)؛ [[none]] ← ارجاع no_source؛ [[badjson]] ← جواب غیر JSON
//   [[primary500]] ← مدل اصلی ۵۰۰ (مسیر مدل پشتیبان)؛ [[down]] ← هر دو مدل ۵۰۰؛ [[notools]] ← ۴۰۰ «tools not supported» اگر tools فرستاده شود
//   [[slow]] ← ۴ ثانیه مکث (برای دیدن «در حال نوشتن…»)
//   [[cost:N]] ← total_cost_toman = N (پیش‌فرض ۴۰۰)
// GET /__log ← بدنه‌ی همه‌ی درخواست‌ها؛ POST /__reset ← پاک کردن لاگ.
import http from "node:http";

const port = Number(process.argv[2] ?? 3399);
let log = [];

const out = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const completion = (model, message, cost) => ({
  id: "mock-" + Date.now(),
  model,
  choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: message.tool_calls ? "tool_calls" : "stop" }],
  usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100, total_cost_toman: cost },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

http
  .createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    if (req.url === "/__log") return out(res, 200, log);
    if (req.url === "/__reset") return ((log = []), out(res, 200, { ok: true }));
    if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) return out(res, 404, { error: "not found" });
    if (req.headers.authorization !== "Bearer test") return out(res, 401, { error: "bad key" });
    const body = JSON.parse(raw);
    log.push(body);
    const msgs = body.messages ?? [];
    const sys = msgs.find((m) => m.role === "system")?.content ?? "";
    const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
    const text = lastUser.split("\n---\n").pop();
    const toolMsg = msgs.find((m) => m.role === "tool");
    const primary = body.model !== "mock/fallback";
    const cost = Number(/\[\[cost:(\d+)\]\]/.exec(text)?.[1] ?? 400);
    const json = (o) => out(res, 200, completion(body.model, { content: JSON.stringify(o) }, cost));

    // تست اتصال پنل
    if (sys.includes('{"ok": true')) return out(res, 200, completion(body.model, { content: '{"ok": true, "lang": "fa"}' }, 50));
    if (body.tool_choice?.function?.name === "landed_cost") {
      const slug = /slug «([^»]+)»/.exec(lastUser)?.[1] ?? "x";
      return out(
        res,
        200,
        completion(
          body.model,
          { content: null, tool_calls: [{ id: "call_ct", type: "function", function: { name: "landed_cost", arguments: JSON.stringify({ product_slug: slug, qty: 100 }) } }] },
          50,
        ),
      );
    }
    if (toolMsg && sys.includes("حتماً از ابزار")) return out(res, 200, completion(body.model, { content: "قیمت تخمینی آماده است." }, 50));

    if (text.includes("[[slow]]")) await sleep(4000);
    if (text.includes("[[down]]") || (primary && text.includes("[[primary500]]"))) return out(res, 500, { error: "mock down" });
    if (text.includes("[[notools]]") && body.tools) return out(res, 400, { error: { message: "tools are not supported for this model" } });
    if (text.includes("[[badjson]]")) return out(res, 200, completion(body.model, { content: "سلام! این JSON نیست." }, cost));
    const leak = /\[\[leak:([^\]]+)\]\]/.exec(text)?.[1];
    if (leak) return json({ answer: `این محصول را ${leak} تولید می‌کند.`, source: "product", handoff: null });
    if (text.includes("[[none]]")) return json({ answer: "", source: "none", handoff: { reason: "no_source", note: "mock" } });
    if (text.includes("[[tool]]")) {
      if (toolMsg) {
        const t = JSON.parse(toolMsg.content);
        return json({
          answer: `قیمت تمام‌شده‌ی تخمینی: ${t.available ? t.methods.map((m) => (m.totalToman ?? 0).toLocaleString("en-US")).join(" / ") : "ندارد"}. این قیمت تخمینی است.`,
          source: "calculator",
          handoff: null,
        });
      }
      const slug = /"slug":"([^"]+)"/.exec(lastUser)?.[1] ?? "x";
      return out(
        res,
        200,
        completion(
          body.model,
          { content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "landed_cost", arguments: JSON.stringify({ product_slug: slug, qty: 200 }) } }] },
          cost,
        ),
      );
    }
    return json({ answer: `پاسخ ساختگی ${primary ? "مدل اصلی" : "مدل پشتیبان"}.`, source: "knowledge", handoff: null });
  })
  .listen(port, "127.0.0.1", () => console.log(`mock ai on :${port}`));
