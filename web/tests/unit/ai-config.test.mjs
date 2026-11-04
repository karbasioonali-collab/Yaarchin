// تست واحد بخش ۴۷: خواندن متغیرهای دستیار؛ AI_FALLBACK_MODEL برابر با AI_MODEL = یک تلاش دوباره با همان مدل.
import { DEFAULT_MODEL, parseAiEnv } from "../../src/lib/ai/config-core.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};
const live = { AI_BASE_URL: "https://ai.liara.ir/api/x/v1", AI_API_KEY: "k" };

{
  const c = parseAiEnv({ ...live, AI_MODEL: "anthropic/claude-haiku-4.5", AI_FALLBACK_MODEL: "anthropic/claude-haiku-4.5" });
  ok(c.mode === "live" && c.model === "anthropic/claude-haiku-4.5" && c.fallbackModel === "anthropic/claude-haiku-4.5", "same model as fallback is kept (one retry)");
  ok(parseAiEnv({ ...live, AI_FALLBACK_MODEL: DEFAULT_MODEL }).fallbackModel === DEFAULT_MODEL, "fallback equal to the default model (AI_MODEL empty) is kept");
  ok(parseAiEnv({ ...live, AI_FALLBACK_MODEL: " anthropic/claude-haiku-4.5 " }).fallbackModel === "anthropic/claude-haiku-4.5", "spaces trimmed");
  ok(parseAiEnv({ ...live, AI_FALLBACK_MODEL: "openai/gpt-4o-mini" }).fallbackModel === "openai/gpt-4o-mini", "different model still works");
  ok(parseAiEnv({ ...live }).fallbackModel === null && parseAiEnv({ ...live, AI_FALLBACK_MODEL: "  " }).fallbackModel === null, "empty = no fallback");
  ok(
    parseAiEnv({ AI_API_KEY: "k" }).mode === "test" && parseAiEnv({ ...live, AI_BASE_URL: "http://evil.example/v1" }).mode === "test",
    "missing or non-https base URL → test mode",
  );
  ok(parseAiEnv({ ...live, AI_BASE_URL: "https://ai.liara.ir/api/x/v1/" }).baseUrl === "https://ai.liara.ir/api/x/v1", "trailing slash removed");
}

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
