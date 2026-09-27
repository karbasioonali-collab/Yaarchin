import "server-only";
// خواندنی‌های پنل «نرخ‌ها و هزینه‌ها»: وضعیت نرخ امروز، آخرین نرخ هر ارز و تاریخچه.
import { sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";
import { ratesReady } from "@/lib/db-ready";
import { normHs, tehranDate } from "./snapshot";

export type CurrencyRow = {
  code: string;
  nameFa: string;
  isBase: boolean;
  isActive: boolean;
  market: { rate: number; date: string; at: Date; by: string | null } | null;
  customs: { rate: number; date: string; at: Date; by: string | null } | null;
};

// همه‌ی ارزها با آخرین نرخ بازار و گمرکی (بدون توجه به تاریخ آینده؛ نرخی با تاریخ آینده ثبت نمی‌شود)
export async function currencyRows(): Promise<CurrencyRow[]> {
  const r = await db.execute<{
    code: string;
    name_fa: string;
    is_base: boolean;
    is_active: boolean;
    kind: string | null;
    rate_toman: string | null;
    rate_date: string | null;
    created_at: Date | null;
    by: string | null;
  }>(sql`
    select c.code, c.name_fa, c.is_base, c.is_active, x.kind, x.rate_toman, to_char(x.rate_date, 'YYYY-MM-DD') as rate_date, x.created_at, u.full_name as by
    from currencies c
    left join lateral (
      select distinct on (kind) kind, rate_toman, rate_date, created_at, created_by from exchange_rates e
      where e.currency_code = c.code order by kind, rate_date desc, created_at desc, id desc
    ) x on true
    left join users u on u.id = x.created_by
    order by c.sort_order, c.code`);
  const out = new Map<string, CurrencyRow>();
  for (const row of r.rows) {
    const c = out.get(row.code) ?? { code: row.code, nameFa: row.name_fa, isBase: row.is_base, isActive: row.is_active, market: null, customs: null };
    if (row.kind && row.rate_toman && row.rate_date) {
      c[row.kind === "customs" ? "customs" : "market"] = { rate: Number(row.rate_toman), date: row.rate_date, at: new Date(row.created_at!), by: row.by };
    }
    out.set(row.code, c);
  }
  return [...out.values()];
}

// ارزهای فعالی که نرخ بازار «امروز» (تاریخ تهران) ندارند؛ برای هشدار بالای پنل و داشبورد. [] قبل از migration.
export const missingTodayRates = cache(async (): Promise<{ code: string; nameFa: string; lastDate: string | null }[]> => {
  if (!(await ratesReady())) return [];
  const today = tehranDate();
  const r = await db.execute<{ code: string; name_fa: string; last_date: string | null }>(sql`
    select c.code, c.name_fa, (select to_char(max(rate_date), 'YYYY-MM-DD') from exchange_rates e where e.currency_code = c.code and e.kind = 'market') as last_date
    from currencies c where c.is_active and not c.is_base order by c.sort_order, c.code`);
  return r.rows.filter((x) => x.last_date !== today).map((x) => ({ code: x.code, nameFa: x.name_fa, lastDate: x.last_date }));
});

// «معتبر از» فرم‌ها: خالی = همین حالا؛ datetime-local به ساعت تهران. گذشته پذیرفته نمی‌شود (نسخه‌ی گذشته تاریخچه را گیج می‌کند).
export function validFromInput(raw: string): { at: Date } | { error: string } {
  if (!raw) return { at: new Date() };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return { error: "«معتبر از» نامعتبر است." };
  const at = new Date(`${raw}:00+03:30`);
  if (Number.isNaN(at.getTime())) return { error: "«معتبر از» نامعتبر است." };
  if (at.getTime() < Date.now() - 5 * 60 * 1000) return { error: "«معتبر از» نمی‌تواند گذشته باشد؛ خالی بگذارید تا از همین حالا معتبر شود." };
  return { at };
}

// نسخه‌ی فعلی یک HS code برای نمایش کنار فیلد محصول (null = در لیست نیست یا غیرفعال است)
export async function hsLookup(raw: string | null | undefined): Promise<{ code: string; titleFa: string | null; duty: string } | null> {
  const code = normHs(raw);
  if (!code || !(await ratesReady())) return null;
  const r = await db.execute<{ code: string; title_fa: string | null; is_active: boolean; duty_type: string; duty_value: string; duty_currency: string | null }>(sql`
    select code, title_fa, is_active, duty_type, duty_value, duty_currency from hs_code_versions
    where code = ${code} and valid_from <= now() order by valid_from desc, id desc limit 1`);
  const x = r.rows[0];
  if (!x || !x.is_active) return null;
  const v = Number(x.duty_value).toLocaleString("fa-IR");
  return { code: x.code, titleFa: x.title_fa, duty: x.duty_type === "percent" ? `${v}٪` : `${v} ${x.duty_currency ?? "IRT"}` };
}
