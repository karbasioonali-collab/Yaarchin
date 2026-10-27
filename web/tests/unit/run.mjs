// همه‌ی تست‌های واحد (tests/unit/*.test.mjs) را جدا اجرا می‌کند؛ اگر یکی ناموفق بود، خروجی ۱.
// بدون دیتابیس و مرورگر؛ در GitHub Actions قبل از استقرار هم اجرا می‌شود. اجرا (از پوشه‌ی web): npm run test:unit
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const dir = new URL(".", import.meta.url).pathname;
let failed = 0;
for (const f of readdirSync(dir)
  .filter((x) => x.endsWith(".test.mjs"))
  .sort()) {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", `${dir}ts-resolve.mjs`, `${dir}${f}`], { encoding: "utf8" });
  const out = (r.stdout + r.stderr).trim().split("\n");
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${f}: ${out.at(-1)}`);
  if (!ok)
    console.log(
      out
        .filter((l) => l.startsWith("FAIL") || /Error/.test(l))
        .slice(0, 30)
        .join("\n"),
    );
}
console.log(failed ? `\n${failed} unit file(s) FAILED` : "\nALL UNIT TESTS PASSED");
process.exitCode = failed ? 1 : 0;
