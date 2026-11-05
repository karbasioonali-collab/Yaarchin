import "server-only";
// جمع روزانه‌ی هزینه‌ی هوش مصنوعی برای صفحه‌ی «هزینه‌ی هوش مصنوعی» (بخش ۵۲). فقط درخواست‌های زنده (حالت آزمایشی هزینه ندارد).
// یک کوئری: هر روز تهران × purpose؛ گروه‌بندی هفته، ماه و سال شمسی در cost-chart.ts (خالص). کش ۶۰ ثانیه مثل داشبورد.
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { TtlCache } from "@/lib/dashboard/core";
import { aiReady } from "@/lib/db-ready";
import { tehranYmd } from "@/lib/tehran-time";
import type { CostRow } from "./cost-chart";

const ttl = Number(process.env.DASHBOARD_CACHE_MS);
const cache = new TtlCache(process.env.DASHBOARD_CACHE_MS !== undefined && Number.isFinite(ttl) && ttl >= 0 ? ttl : 60_000);

export async function dailyCosts(): Promise<CostRow[] | null> {
  if (!(await aiReady())) return null;
  return cache.get(`costs:${tehranYmd()}`, async () => {
    const r = await db.execute<{ ymd: string; purpose: string; cost: string }>(sql`
      select to_char((created_at at time zone 'Asia/Tehran')::date, 'YYYY-MM-DD') as ymd, purpose, sum(cost_toman) as cost
      from ai_requests where mode = 'live' and cost_toman > 0 group by 1, 2 order by 1`);
    return r.rows.map((x) => ({ ymd: x.ymd, purpose: x.purpose, cost: Number(x.cost) }));
  });
}
