import "server-only";
// لایه‌ی داده‌ی «عمومی» کاتالوگ: تنها راهی که صفحه‌های سایت و API عمومی (/api/v1) به محصول و دسته می‌رسند.
//
// قانون محرمانگی کارخانه‌ها: از جدول companies و ستون‌های داخلی لیستینگ (external_url، title_en، specs، meta)
// هیچ‌چیزی در این فایل select نمی‌شود. companies فقط برای فیلتر وضعیت (blocked) join می‌شود.
// خروجی‌ها فیلد‌به‌فیلد ساخته می‌شوند (هیچ‌وقت ردیف دیتابیس را spread نکنید) تا ستون جدید خودبه‌خود عمومی نشود.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";
import { db } from "@/db/client";
import { categories, productMedia, products } from "@/db/schema";
import { catalogReady, importScoreReady } from "@/lib/db-ready";
import { type ImportScore, toImportScore } from "./import-score";
import { mediaUrl } from "@/lib/storage";
import { type LandedCost, landedCostFor } from "@/lib/pricing/landed";

export type PublicCategory = {
  slug: string;
  nameFa: string;
  descriptionFa: string | null;
  imageUrl: string | null;
  // تعداد محصولات منتشرشده در خودش و همه‌ی زیرشاخه‌ها
  productCount: number;
  children: PublicCategory[];
};

export type PriceSummary = {
  currency: "USD";
  unit: string;
  avg: number;
  min: number;
  max: number;
  // تعداد کارخانه‌هایی (نه لیستینگ‌هایی) که قیمت دارند
  pricedSuppliers: number;
  lastObservedAt: string;
};

export type ProductCard = {
  slug: string;
  titleFa: string;
  summaryFa: string | null;
  // «جذاب برای واردات»؛ null = بدون امتیاز (ستاره نمایش داده نمی‌شود)
  importScore: ImportScore | null;
  coverUrl: string | null;
  categoryName: string | null;
  suppliers: number;
  price: PriceSummary | null;
};

export type PublicSpec = { label: string; value: string };
export type PublicMedia = { kind: "image" | "video"; url: string; posterUrl: string | null; alt: string; width: number | null; height: number | null };

export type PublicProduct = ProductCard & {
  titleEn: string | null;
  descriptionFa: string | null;
  specs: PublicSpec[];
  media: PublicMedia[];
  moqMin: number | null;
  leadTimeDays: { min: number; max: number } | null;
  breadcrumb: { slug: string; nameFa: string }[];
  landedCost: LandedCost;
  updatedAt: string;
};

// ---------- دسته‌ها ----------
type CatRow = { id: string; parentId: string | null; slug: string; nameFa: string; descriptionFa: string | null; image: string | null };
type CatIndex = { byId: Map<string, CatRow>; children: Map<string | null, CatRow[]>; ownCount: Map<string, number> };

const loadCategories = cache(async (): Promise<CatIndex> => {
  await connection();
  if (!(await catalogReady())) return { byId: new Map(), children: new Map(), ownCount: new Map() };
  const rows = await db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      slug: categories.slug,
      nameFa: categories.nameFa,
      descriptionFa: categories.descriptionFa,
      image: categories.image,
    })
    .from(categories)
    .where(eq(categories.status, "active"))
    .orderBy(asc(categories.sortOrder), asc(categories.nameFa));
  const counts = await db
    .select({ categoryId: products.categoryId, n: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.status, "published"))
    .groupBy(products.categoryId);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const children = new Map<string | null, CatRow[]>();
  for (const r of rows) {
    // دسته‌ای که والدش مخفی است، عملاً مخفی است (به ریشه نمی‌آید)
    if (r.parentId && !byId.has(r.parentId)) continue;
    const list = children.get(r.parentId) ?? [];
    list.push(r);
    children.set(r.parentId, list);
  }
  const ownCount = new Map(counts.filter((c) => c.categoryId).map((c) => [c.categoryId as string, c.n]));
  return { byId, children, ownCount };
});

function buildNode(idx: CatIndex, row: CatRow, depth = 0): PublicCategory {
  // محافظ حلقه‌ی ناخواسته در داده (والدِ خودش)
  const kids = depth > 50 ? [] : (idx.children.get(row.id) ?? []).map((c) => buildNode(idx, c, depth + 1));
  return {
    slug: row.slug,
    nameFa: row.nameFa,
    descriptionFa: row.descriptionFa,
    imageUrl: mediaUrl(row.image),
    productCount: (idx.ownCount.get(row.id) ?? 0) + kids.reduce((s, k) => s + k.productCount, 0),
    children: kids,
  };
}

export async function getCategoryTree(): Promise<PublicCategory[]> {
  const idx = await loadCategories();
  return (idx.children.get(null) ?? []).map((r) => buildNode(idx, r));
}

function subtreeIds(idx: CatIndex, id: string, out: string[] = [], depth = 0): string[] {
  out.push(id);
  if (depth < 50) for (const c of idx.children.get(id) ?? []) subtreeIds(idx, c.id, out, depth + 1);
  return out;
}

function ancestors(idx: CatIndex, id: string | null): { slug: string; nameFa: string }[] {
  const path: { slug: string; nameFa: string }[] = [];
  let cur = id ? idx.byId.get(id) : undefined;
  for (let i = 0; cur && i < 50; i++) {
    path.unshift({ slug: cur.slug, nameFa: cur.nameFa });
    cur = cur.parentId ? idx.byId.get(cur.parentId) : undefined;
  }
  return path;
}

export async function getCategoryPage(slug: string) {
  const idx = await loadCategories();
  const row = [...idx.byId.values()].find((r) => r.slug === slug);
  if (!row) return null;
  // دسته‌ای که یکی از والدهایش مخفی است پیدا نمی‌شود
  if (!isReachable(idx, row)) return null;
  return {
    category: buildNode(idx, row),
    breadcrumb: ancestors(idx, row.id),
    ids: subtreeIds(idx, row.id),
  };
}

function isReachable(idx: CatIndex, row: CatRow): boolean {
  let cur: CatRow | undefined = row;
  for (let i = 0; cur && i < 50; i++) {
    if (!cur.parentId) return true;
    cur = idx.byId.get(cur.parentId);
  }
  return false;
}

// ---------- قیمت و آمار لیستینگ‌ها (بدون هیچ فیلد شناسایی کارخانه) ----------
type Stats = { suppliers: number; moqMin: number | null; ltMin: number | null; ltMax: number | null; price: Omit<PriceSummary, "unit"> | null };

async function statsFor(productIds: string[]): Promise<Map<string, Stats>> {
  const out = new Map<string, Stats>();
  if (!productIds.length) return out;
  const ids = sql`array[${sql.join(productIds.map((id) => sql`${id}::uuid`), sql`, `)}]`;

  // لیستینگ‌های فعالِ کارخانه‌های غیرمسدود
  const listingStats = await db.execute<{ product_id: string; suppliers: number; moq_min: number | null; lt_min: number | null; lt_max: number | null }>(sql`
    select pl.product_id, count(distinct pl.company_id)::int as suppliers,
           min(pl.moq)::int as moq_min, min(pl.lead_time_days)::int as lt_min, max(pl.lead_time_days)::int as lt_max
    from product_listings pl
    join companies c on c.id = pl.company_id and c.status <> 'blocked'
    where pl.status = 'active' and pl.product_id = any(${ids})
    group by pl.product_id`);

  // برای هر لیستینگ فقط آخرین نوبتِ مشاهده‌ی قیمت حساب می‌شود: همه‌ی ردیف‌های تا یک ساعت قبل از جدیدترین
  // (پله‌های قیمتِ یک صفحه با فاصله‌ی چند میلی‌ثانیه ثبت می‌شوند؛ «برابر بودن زمان» معیار درستی نیست).
  // «میانگین» = میانگینِ وسطِ بازه‌ی هر کارخانه (هر کارخانه یک رأی، حتی با چند لیستینگ)؛
  // «بازه» = کمترین تا بیشترین قیمت همه‌ی کارخانه‌ها.
  const priceStats = await db.execute<{ product_id: string; n: number; lo: string; hi: string; avg: string; at: Date }>(sql`
    with latest as (
      select po.listing_id, pl.product_id, pl.company_id, po.price_min, coalesce(po.price_max, po.price_min) as price_max, po.observed_at,
             max(po.observed_at) over (partition by po.listing_id) as last_at
      from price_observations po
      join product_listings pl on pl.id = po.listing_id and pl.status = 'active'
      join companies c on c.id = pl.company_id and c.status <> 'blocked'
      where po.currency = 'USD' and pl.product_id = any(${ids})
    ), per_listing as (
      select product_id, listing_id, company_id, min(price_min) as lo, max(price_max) as hi, max(observed_at) as at
      from latest where observed_at > last_at - interval '1 hour' group by product_id, listing_id, company_id
    ), per_company as (
      select product_id, company_id, min(lo) as lo, max(hi) as hi, avg((lo + hi) / 2) as mid, max(at) as at
      from per_listing group by product_id, company_id
    )
    select product_id, count(*)::int as n, min(lo) as lo, max(hi) as hi, avg(mid) as avg, max(at) as at
    from per_company group by product_id`);

  for (const r of listingStats.rows) {
    out.set(r.product_id, { suppliers: r.suppliers, moqMin: r.moq_min, ltMin: r.lt_min, ltMax: r.lt_max, price: null });
  }
  for (const r of priceStats.rows) {
    const s = out.get(r.product_id);
    if (!s) continue;
    s.price = {
      currency: "USD",
      avg: round2(Number(r.avg)),
      min: round2(Number(r.lo)),
      max: round2(Number(r.hi)),
      pricedSuppliers: r.n,
      lastObservedAt: new Date(r.at).toISOString(),
    };
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- محصول ----------
// ستون import_score فقط وقتی select می‌شود که migration ۰۰۰۲ اجرا شده باشد؛ قبل از آن null.
async function cardColumns() {
  return {
    id: products.id,
    slug: products.slug,
    titleFa: products.titleFa,
    summaryFa: products.summaryFa,
    categoryId: products.categoryId,
    priceUnit: products.priceUnit,
    importScore: (await importScoreReady()) ? products.importScore : sql<string | null>`null`,
  };
}

type CardRow = { id: string; slug: string; titleFa: string; summaryFa: string | null; categoryId: string | null; priceUnit: string; importScore: string | null };

async function toCards(rows: CardRow[]): Promise<ProductCard[]> {
  if (!rows.length) return [];
  const idx = await loadCategories();
  const ids = rows.map((r) => r.id);
  const [stats, covers] = await Promise.all([
    statsFor(ids),
    db
      .selectDistinctOn([productMedia.productId], { productId: productMedia.productId, key: productMedia.storageKey, poster: productMedia.posterKey, kind: productMedia.kind })
      .from(productMedia)
      .where(and(inArray(productMedia.productId, ids), eq(productMedia.isPublic, true)))
      .orderBy(productMedia.productId, sql`(${productMedia.kind} = 'image') desc`, asc(productMedia.sortOrder)),
  ]);
  const coverOf = new Map(covers.map((c) => [c.productId, c.kind === "image" ? c.key : c.poster]));
  return rows.map((r) => {
    const s = stats.get(r.id);
    return {
      slug: r.slug,
      titleFa: r.titleFa,
      summaryFa: r.summaryFa,
      importScore: toImportScore(r.importScore),
      coverUrl: mediaUrl(coverOf.get(r.id)),
      categoryName: (r.categoryId && idx.byId.get(r.categoryId)?.nameFa) || null,
      suppliers: s?.suppliers ?? 0,
      price: s?.price ? { ...s.price, unit: r.priceUnit } : null,
    };
  });
}

export async function listProducts(opts: { categoryIds?: string[]; limit?: number; excludeSlug?: string } = {}): Promise<ProductCard[]> {
  await connection();
  if (!(await catalogReady())) return [];
  const where = [eq(products.status, "published")];
  if (opts.categoryIds) {
    if (!opts.categoryIds.length) return [];
    where.push(inArray(products.categoryId, opts.categoryIds));
  }
  if (opts.excludeSlug) where.push(sql`${products.slug} <> ${opts.excludeSlug}`);
  const rows = await db
    .select(await cardColumns())
    .from(products)
    .where(and(...where))
    .orderBy(desc(products.publishedAt), desc(products.createdAt))
    .limit(Math.min(opts.limit ?? 24, 100));
  return toCards(rows);
}

export async function listProductsInCategory(slug: string, limit = 48): Promise<ProductCard[] | null> {
  const page = await getCategoryPage(slug);
  if (!page) return null;
  return listProducts({ categoryIds: page.ids, limit });
}

type RawSpec = { labelFa?: unknown; valueFa?: unknown; unit?: unknown };
function publicSpecs(v: unknown): PublicSpec[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is RawSpec => typeof s === "object" && s !== null)
    .map((s) => ({
      label: typeof s.labelFa === "string" ? s.labelFa : "",
      value: [s.valueFa, s.unit].filter((x) => typeof x === "string" && x).join(" "),
    }))
    .filter((s) => s.label && s.value);
}

export async function getProduct(slug: string): Promise<PublicProduct | null> {
  await connection();
  if (!(await catalogReady())) return null;
  const [p] = await db
    .select({
      ...(await cardColumns()),
      titleEn: products.titleEn,
      descriptionFa: products.descriptionFa,
      specs: products.specs,
      hsCode: products.hsCode,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, "published")));
  if (!p) return null;

  const idx = await loadCategories();
  const [[card], stats, media] = await Promise.all([
    toCards([p]),
    statsFor([p.id]),
    db
      .select({
        kind: productMedia.kind,
        key: productMedia.storageKey,
        poster: productMedia.posterKey,
        alt: productMedia.altFa,
        width: productMedia.width,
        height: productMedia.height,
      })
      .from(productMedia)
      .where(and(eq(productMedia.productId, p.id), eq(productMedia.isPublic, true)))
      .orderBy(asc(productMedia.sortOrder)),
  ]);
  const s = stats.get(p.id);

  return {
    ...card,
    titleEn: p.titleEn,
    descriptionFa: p.descriptionFa,
    specs: publicSpecs(p.specs),
    media: media.flatMap((m) => {
      const url = mediaUrl(m.key);
      return url
        ? [{ kind: m.kind, url, posterUrl: mediaUrl(m.poster), alt: m.alt ?? p.titleFa, width: m.width, height: m.height }]
        : [];
    }),
    moqMin: s?.moqMin ?? null,
    leadTimeDays: s?.ltMin != null && s?.ltMax != null ? { min: s.ltMin, max: s.ltMax } : null,
    breadcrumb: ancestors(idx, p.categoryId),
    landedCost: await landedCostFor({ price: card.price, hsCode: p.hsCode }),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// برای فوتر و نقشه‌ی سایت
export async function latestProductLinks(limit: number): Promise<{ slug: string; titleFa: string }[]> {
  await connection();
  if (!(await catalogReady())) return [];
  return db
    .select({ slug: products.slug, titleFa: products.titleFa })
    .from(products)
    .where(eq(products.status, "published"))
    .orderBy(desc(products.publishedAt), desc(products.createdAt))
    .limit(limit);
}
