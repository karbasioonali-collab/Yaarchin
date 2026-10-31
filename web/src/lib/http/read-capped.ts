import "server-only";
// خواندن بدنه‌ی درخواست با سقف حجم (آپلود عکس و ویدیو، و ورود صفحه‌ی علی‌بابا).
// اگر Content-Length بزرگ‌تر باشد فوراً رد می‌شود، وگرنه هنگام خواندن شمرده می‌شود و با گذشتن از سقف خواندن قطع می‌شود.
import type { NextRequest } from "next/server";

export async function readCapped(req: NextRequest, max: number): Promise<Buffer | "too_big" | "empty"> {
  const len = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(len) && len > max) return "too_big";
  if (!req.body) return "empty";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      await reader.cancel().catch(() => undefined);
      return "too_big";
    }
    chunks.push(value);
  }
  return n ? Buffer.concat(chunks) : "empty";
}
