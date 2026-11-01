import "server-only";
// «میانگین عمومی چطور ساخته شده» برای پنل: همان قاعده‌ی سایت (src/lib/pricing/reference.ts) با جزئیات هر لیستینگ. بخش ۳۸.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, productListings, products } from "@/db/schema";
import { ratesReady } from "@/lib/db-ready";
import { defaultReferenceQty, referencePrice, type RefListing, type RefPrice } from "@/lib/pricing/reference";
import { latestByCurrency, priceHistory } from "./admin-listing";

export type AdminReference = { manual: number | null; defaultQty: number | null; price: RefPrice | null; cnyUsd: number | null };

export const manualRefQty = (meta: unknown): number | null => {
  const v = (meta as { referenceQty?: unknown } | null)?.referenceQty;
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
};

async function cnyPerUsd(): Promise<number | null> {
  if (!(await ratesReady())) return null;
  const r = await db.execute<{ k: string | null }>(sql`
    select (select rate_toman from exchange_rates where currency_code = 'CNY' and kind = 'market' and rate_date <= (now() at time zone 'Asia/Tehran')::date order by rate_date desc, created_at desc, id desc limit 1)
         / (select rate_toman from exchange_rates where currency_code = 'USD' and kind = 'market' and rate_date <= (now() at time zone 'Asia/Tehran')::date order by rate_date desc, created_at desc, id desc limit 1) as k`);
  const k = r.rows[0]?.k;
  return k === null || k === undefined ? null : Number(k);
}

export async function adminReference(productId: string): Promise<AdminReference> {
  const [[p], ls, k] = await Promise.all([
    db.select({ meta: products.meta }).from(products).where(eq(products.id, productId)),
    db
      .select({ id: productListings.id, companyId: productListings.companyId, moq: productListings.moq })
      .from(productListings)
      .innerJoin(companies, eq(companies.id, productListings.companyId))
      .where(and(eq(productListings.productId, productId), eq(productListings.status, "active"), eq(companies.status, "active"))),
    cnyPerUsd(),
  ]);
  const hist = await priceHistory(ls.map((l) => l.id));
  const listings: RefListing[] = [];
  for (const l of ls) {
    // آخرین نوبتِ ارزی که قابل استفاده است (دلار، یا یوان وقتی هر دو نرخ ثبت شده)
    const batch = latestByCurrency(hist.get(l.id))
      .filter((b) => b.currency === "USD" || (b.currency === "CNY" && k !== null))
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0];
    const f = batch?.currency === "CNY" ? k! : 1;
    listings.push({
      listingId: l.id,
      companyId: l.companyId,
      moq: l.moq,
      tiers: batch ? batch.tiers.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty, priceMin: t.priceMin * f, priceMax: t.priceMax === null ? null : t.priceMax * f })) : [],
    });
  }
  const manual = manualRefQty(p?.meta);
  return { manual, defaultQty: defaultReferenceQty(listings), price: referencePrice(listings, manual), cnyUsd: k };
}
