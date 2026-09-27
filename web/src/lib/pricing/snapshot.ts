import "server-only";
// خواندن «عکس فوری» نرخ‌ها (RateSnapshot) و ورودی محصول (LandedInput) از دیتابیس برای ماشین‌حساب (compute.ts).
// «مقدار فعلی» هر جدول نسخه‌دار = جدیدترین نسخه‌ای که valid_from و created_at آن تا لحظه‌ی at رسیده باشد.
// با at گذشته همان نرخ‌های آن لحظه برمی‌گردد (برای بررسی یا بازسازی یک پیش‌فاکتور)؛ پیش‌فرض: همین حالا.
import { and, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";
import { companies, productListings, products } from "@/db/schema";
import { latestByCurrency, leadTimeHistory, priceHistory } from "@/lib/catalog/admin-listing";
import { ratesReady } from "@/lib/db-ready";
import { toLatinDigits } from "@/lib/validation";
import type { CostRule, HsRule, LandedInput, RateInfo, RateSnapshot, ShippingRule, TaxRule } from "./compute";

// تاریخ امروز به تقویم میلادی و ساعت تهران (YYYY-MM-DD)؛ «نرخ امروز» یعنی rate_date برابر همین
const tehranFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
export const tehranDate = (d = new Date()) => tehranFmt.format(d);

// HS code متنی محصول ← فقط رقم (8509.40.00 ← 85094000)؛ کمتر از ۴ یا بیشتر از ۱۲ رقم = نامعتبر
export function normHs(raw: string | null | undefined): string | null {
  const d = toLatinDigits(String(raw ?? "")).replace(/\D/g, "");
  return d.length >= 4 && d.length <= 12 ? d : null;
}

const numOrNull = (v: string | null) => (v === null ? null : Number(v));

async function loadSnapshot(atIso: string | null, hsCodes: string[]): Promise<RateSnapshot> {
  const at = atIso ? new Date(atIso) : new Date();
  const day = tehranDate(at);
  const [cur, rates, ship, costs, tax, hs] = await Promise.all([
    db.execute<{ code: string; name_fa: string; is_base: boolean }>(sql`select code, name_fa, is_base from currencies order by sort_order, code`),
    db.execute<{ id: number; currency_code: string; kind: "market" | "customs"; rate_toman: string; rate_date: string }>(sql`
      select distinct on (currency_code, kind) id, currency_code, kind, rate_toman, to_char(rate_date, 'YYYY-MM-DD') as rate_date
      from exchange_rates where rate_date <= ${day}::date and created_at <= ${at}
      order by currency_code, kind, rate_date desc, created_at desc, id desc`),
    db.execute<{
      key: string;
      name_fa: string;
      sort_order: number;
      id: number | null;
      is_active: boolean | null;
      rate_per_kg: string | null;
      rate_per_cbm: string | null;
      volumetric_factor: string | null;
      min_charge: string | null;
      currency_code: string | null;
      transit_min_days: number | null;
      transit_max_days: number | null;
    }>(sql`
      select m.key, m.name_fa, m.sort_order, v.id, v.is_active, v.rate_per_kg, v.rate_per_cbm, v.volumetric_factor, v.min_charge, v.currency_code,
             v.transit_min_days, v.transit_max_days
      from shipping_methods m
      left join lateral (select * from shipping_method_versions x where x.method_key = m.key and x.valid_from <= ${at} and x.created_at <= ${at}
                         order by x.valid_from desc, x.id desc limit 1) v on true
      order by m.sort_order`),
    db.execute<{
      id: number;
      item_id: string;
      name_fa: string;
      is_active: boolean;
      calc_type: CostRule["calcType"];
      amount: string | null;
      percent_base: string[] | null;
      formula: string | null;
      currency_code: string | null;
      methods: string[] | null;
    }>(sql`
      select v.id, i.id as item_id, i.name_fa, v.is_active, v.calc_type, v.amount, v.percent_base, v.formula, v.currency_code, v.methods
      from cost_items i
      join lateral (select * from cost_item_versions x where x.item_id = i.id and x.valid_from <= ${at} and x.created_at <= ${at}
                    order by x.valid_from desc, x.id desc limit 1) v on true
      order by i.sort_order, i.created_at`),
    db.execute<{ id: number; vat_percent: string; vat_base: string[]; customs_rate_for: string[] }>(sql`
      select id, vat_percent, vat_base, customs_rate_for from tax_versions where valid_from <= ${at} and created_at <= ${at}
      order by valid_from desc, id desc limit 1`),
    hsCodes.length
      ? db.execute<{
          id: number;
          code: string;
          title_fa: string | null;
          is_active: boolean;
          duty_type: "percent" | "fixed";
          duty_value: string;
          duty_base: string[] | null;
          duty_currency: string | null;
          fixed_per: HsRule["fixedPer"];
        }>(sql`
          select distinct on (code) id, code, title_fa, is_active, duty_type, duty_value, duty_base, duty_currency, fixed_per
          from hs_code_versions where code = any(${sql`array[${sql.join(
            hsCodes.map((c) => sql`${c}`),
            sql`, `,
          )}]::text[]`})
            and valid_from <= ${at} and created_at <= ${at}
          order by code, valid_from desc, id desc`)
      : Promise.resolve({ rows: [] }),
  ]);

  const market: Record<string, RateInfo> = {};
  const customs: Record<string, RateInfo> = {};
  for (const r of rates.rows) (r.kind === "customs" ? customs : market)[r.currency_code] = { id: Number(r.id), rate: Number(r.rate_toman), date: r.rate_date };

  const t = tax.rows[0];
  return {
    takenAt: at.toISOString(),
    today: day,
    currencies: Object.fromEntries(cur.rows.map((c) => [c.code, { nameFa: c.name_fa, isBase: c.is_base }])),
    market,
    customs,
    shipping: ship.rows.map(
      (r): ShippingRule => ({
        versionId: r.id === null ? null : Number(r.id),
        key: r.key,
        nameFa: r.name_fa,
        sortOrder: r.sort_order,
        isActive: r.is_active === true,
        ratePerKg: numOrNull(r.rate_per_kg),
        ratePerCbm: numOrNull(r.rate_per_cbm),
        volumetricFactor: numOrNull(r.volumetric_factor),
        minCharge: numOrNull(r.min_charge),
        currency: r.currency_code,
        transitMinDays: r.transit_min_days,
        transitMaxDays: r.transit_max_days,
      }),
    ),
    costs: costs.rows
      .filter((r) => r.is_active)
      .map(
        (r): CostRule => ({
          versionId: Number(r.id),
          itemId: r.item_id,
          nameFa: r.name_fa,
          calcType: r.calc_type,
          amount: numOrNull(r.amount),
          percentBase: r.percent_base as CostRule["percentBase"],
          formula: r.formula,
          currency: r.currency_code,
          methods: r.methods,
        }),
      ),
    tax: t
      ? ({
          versionId: Number(t.id),
          vatPercent: Number(t.vat_percent),
          vatBase: t.vat_base as TaxRule["vatBase"],
          customsRateFor: t.customs_rate_for as TaxRule["customsRateFor"],
        } satisfies TaxRule)
      : null,
    hs: Object.fromEntries(
      hs.rows.map((r) => [
        r.code,
        {
          versionId: Number(r.id),
          code: r.code,
          titleFa: r.title_fa,
          isActive: r.is_active,
          dutyType: r.duty_type,
          dutyValue: Number(r.duty_value),
          dutyBase: r.duty_base as HsRule["dutyBase"],
          dutyCurrency: r.duty_currency,
          fixedPer: r.fixed_per,
        } satisfies HsRule,
      ]),
    ),
  };
}

// در یک درخواست، یک بار برای هر ترکیب (صفحه‌ی محصول و API هم‌زمان چند بار صدا می‌زنند)
export const rateSnapshot = cache(async (hsCodes: string, atIso: string | null = null) => loadSnapshot(atIso, hsCodes ? hsCodes.split(",") : []));

// قیمت‌ها و بسته‌بندی محصول: فقط لیستینگ‌های فعالِ کارخانه‌های فعال؛ از هر لیستینگ آخرین نوبت هر ارز و آخرین نوبت زمان آماده‌سازی.
export async function landedInput(productId: string, qty: number): Promise<LandedInput | null> {
  const [p] = await db
    .select({
      id: products.id,
      priceUnit: products.priceUnit,
      hsCode: products.hsCode,
      unitWeightKg: products.unitWeightKg,
      cartonLengthCm: products.cartonLengthCm,
      cartonWidthCm: products.cartonWidthCm,
      cartonHeightCm: products.cartonHeightCm,
      cartonWeightKg: products.cartonWeightKg,
      unitsPerCarton: products.unitsPerCarton,
    })
    .from(products)
    .where(eq(products.id, productId));
  if (!p) return null;
  const listings = await db
    .select({ id: productListings.id, companyId: productListings.companyId, moq: productListings.moq, leadTimeDays: productListings.leadTimeDays })
    .from(productListings)
    .innerJoin(companies, and(eq(companies.id, productListings.companyId), eq(companies.status, "active")))
    .where(and(eq(productListings.productId, productId), eq(productListings.status, "active")));
  const ids = listings.map((l) => l.id);
  const [prices, leads] = await Promise.all([priceHistory(ids), leadTimeHistory(ids)]);
  return {
    productId: p.id,
    qty,
    priceUnit: p.priceUnit,
    hsCode: normHs(p.hsCode),
    packing: {
      unitWeightKg: numOrNull(p.unitWeightKg),
      cartonLengthCm: numOrNull(p.cartonLengthCm),
      cartonWidthCm: numOrNull(p.cartonWidthCm),
      cartonHeightCm: numOrNull(p.cartonHeightCm),
      cartonWeightKg: numOrNull(p.cartonWeightKg),
      unitsPerCarton: p.unitsPerCarton,
    },
    listings: listings.map((l) => ({
      companyId: l.companyId,
      moq: l.moq,
      prices: latestByCurrency(prices.get(l.id)).map((b) => ({ currency: b.currency, observedAt: b.observedAt.toISOString(), tiers: b.tiers })),
      leadTiers: leads.get(l.id)?.[0]?.tiers ?? null,
      leadDaysLegacy: l.leadTimeDays,
    })),
  };
}

// کدام‌یک از این HS codeها الان در لیست فعال است (برای صفحه‌ی «اطلاعات ناقص» و فرم محصول)
export async function hsInList(codes: string[]): Promise<Set<string>> {
  if (!codes.length || !(await ratesReady())) return new Set();
  const r = await db.execute<{ code: string; is_active: boolean }>(sql`
    select distinct on (code) code, is_active from hs_code_versions where code = any(${sql`array[${sql.join(
      codes.map((c) => sql`${c}`),
      sql`, `,
    )}]::text[]`})
      and valid_from <= now() order by code, valid_from desc, id desc`);
  return new Set(r.rows.filter((x) => x.is_active).map((x) => x.code));
}
