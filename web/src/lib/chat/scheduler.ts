import "server-only";
// زمان‌بند داخل خود برنامه برای یادآوری «پیام بی‌پاسخ» (بدون cron یا سرویس بیرونی). از src/instrumentation.ts یک بار
// هنگام بالا آمدن سرور شروع می‌شود و هر ۶۰ ثانیه runReminders را صدا می‌زند.
// قفل دیتابیس (pg_try_advisory_xact_lock): اگر چند نسخه از برنامه هم‌زمان اجرا شوند، در هر دور فقط یکی کار می‌کند و پیامک تکراری نمی‌رود.
// docs/infoyaarchin.md بخش ۲۵.
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { siteUrl } from "@/lib/site/url";
import { runReminders } from "./alerts";

const EVERY_MS = 60_000;
let started = false;

async function tick() {
  try {
    await db.transaction(async (tx) => {
      const r = await tx.execute<{ ok: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext('yc_chat_reminders')) as ok`);
      if (!r.rows[0]?.ok) return;
      // خارج از درخواست هدری نیست؛ لینک فقط با SITE_URL ساخته می‌شود (docs/liara-setup.md بخش ۱۴)
      const base = siteUrl();
      await runReminders((id) => (base ? `${base}/admin/chats/${id}` : null));
    });
  } catch (e) {
    // قبل از migrate یا قطعی کوتاه دیتابیس: فقط لاگ، دور بعد دوباره
    console.error("chat reminder tick failed:", e instanceof Error ? e.message : e);
  }
}

export function startChatScheduler() {
  if (started || !process.env.DATABASE_URL) return;
  started = true;
  setInterval(() => void tick(), EVERY_MS).unref();
}
