import "server-only";
// حداکثر ۳ درخواست هم‌زمان به مدل؛ بقیه در صف (حداکثر ۲۰). صف پر = «شلوغی» ← ارجاع به کارشناس، نه گیر کردن.
// فقط در همین پروسه (لیارا یک نسخه از برنامه اجرا می‌کند). docs/infoyaarchin.md بخش ۲۹.
const MAX_ACTIVE = 3;
const MAX_QUEUE = 20;
let active = 0;
const waiting: (() => void)[] = [];

export class BusyError extends Error {}

export async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_ACTIVE) {
    if (waiting.length >= MAX_QUEUE) throw new BusyError("صف دستیار پر است.");
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}
