import "server-only";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { leadTimeObservations, priceObservations } from "@/db/schema";
import { catalogAdminReady } from "@/lib/db-ready";

// آخرین «نوبت» قیمت و زمان آماده‌سازی هر لیستینگ برای پنل.
// نوبت = همه‌ی ردیف‌های تا ۲ ثانیه قبل از جدیدترین ردیفِ همان لیستینگ (و برای قیمت: همان ارز)؛
// همان قاعده‌ای که سایت برای میانگین استفاده می‌کند (src/lib/catalog/public.ts → statsFor).
const BATCH_MS = 2000;

export type PriceTier = { minQty: number | null; maxQty: number | null; priceMin: number; priceMax: number | null };
export type PriceBatch = { currency: string; unit: string; observedAt: Date; tiers: PriceTier[]; source: string; note: string | null };
export type LeadTier = { minQty: number | null; maxQty: number | null; days: number };
export type LeadBatch = { observedAt: Date; tiers: LeadTier[]; note: string | null };

const byQty = <T extends { minQty: number | null }>(a: T, b: T) => (a.minQty ?? 0) - (b.minQty ?? 0);

// همه‌ی نوبت‌های قیمت (جدیدترین اول) برای هر لیستینگ؛ به ازای هر ارز جدا
export async function priceHistory(listingIds: string[]): Promise<Map<string, PriceBatch[]>> {
  const out = new Map<string, PriceBatch[]>();
  if (!listingIds.length) return out;
  const rows = await db.select().from(priceObservations).where(inArray(priceObservations.listingId, listingIds)).orderBy(desc(priceObservations.observedAt));
  for (const r of rows) {
    const list = out.get(r.listingId) ?? [];
    // ردیف‌ها جدیدترین اول می‌آیند؛ آخرین نوبتِ همین ارز که ساخته‌ایم، قدیمی‌ترینِ تا اینجاست.
    // اگر این ردیف کمتر از ۲ ثانیه از شروع آن نوبت فاصله دارد، جزو همان نوبت است؛ وگرنه نوبت تازه.
    const last = list.findLast((x) => x.currency === r.currency);
    let b = last && last.observedAt.getTime() - r.observedAt.getTime() < BATCH_MS ? last : undefined;
    if (!b) {
      b = { currency: r.currency, unit: r.unit, observedAt: r.observedAt, tiers: [], source: r.source, note: r.note };
      list.push(b);
    }
    b.tiers.push({ minQty: r.minQty, maxQty: r.maxQty, priceMin: Number(r.priceMin), priceMax: r.priceMax === null ? null : Number(r.priceMax) });
    out.set(r.listingId, list);
  }
  for (const list of out.values()) for (const b of list) b.tiers.sort(byQty);
  return out;
}

export async function leadTimeHistory(listingIds: string[]): Promise<Map<string, LeadBatch[]>> {
  const out = new Map<string, LeadBatch[]>();
  if (!listingIds.length || !(await catalogAdminReady())) return out;
  const rows = await db.select().from(leadTimeObservations).where(inArray(leadTimeObservations.listingId, listingIds)).orderBy(desc(leadTimeObservations.observedAt));
  for (const r of rows) {
    const list = out.get(r.listingId) ?? [];
    let b = list.at(-1);
    if (!b || b.observedAt.getTime() - r.observedAt.getTime() >= BATCH_MS) {
      b = { observedAt: r.observedAt, tiers: [], note: r.note };
      list.push(b);
    }
    b.tiers.push({ minQty: r.minQty, maxQty: r.maxQty, days: r.days });
    out.set(r.listingId, list);
  }
  for (const list of out.values()) for (const b of list) b.tiers.sort(byQty);
  return out;
}

// آخرین نوبت هر ارز (دلار اول)
export function latestByCurrency(history: PriceBatch[] | undefined): PriceBatch[] {
  const seen = new Set<string>();
  const out: PriceBatch[] = [];
  for (const b of history ?? []) {
    if (seen.has(b.currency)) continue;
    seen.add(b.currency);
    out.push(b);
  }
  return out.sort((a, b) => (a.currency === "USD" ? -1 : b.currency === "USD" ? 1 : 0));
}

const n = (x: number) => x.toLocaleString("fa-IR", { maximumFractionDigits: 4 });
export const qtyRange = (t: { minQty: number | null; maxQty: number | null }) => (t.maxQty === null ? `از ${n(t.minQty ?? 1)} به بالا` : `${n(t.minQty ?? 1)} تا ${n(t.maxQty)}`);
export const priceText = (t: PriceTier) => (t.priceMax === null ? n(t.priceMin) : `${n(t.priceMin)} تا ${n(t.priceMax)}`);
