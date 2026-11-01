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
import { catalogAdminReady, catalogReady, importScoreReady, ratesReady } from "@/lib/db-ready";
import { type ImportScore, toImportScore } from "./import-score";
import { mediaUrl } from "@/lib/storage";
import { clampQty, type LandedCost, publicLandedCost } from "@/lib/pricing/landed";
import { orderSpan, referencePrice, type RefListing } from "@/lib/pricing/reference";

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
  // تعداد مرجع: قیمت‌ها برای این تعداد است (reference.ts؛ بخش ۳۸)
  refQty: number;
  // تعداد کارخانه‌هایی (نه لیستینگ‌هایی) که در این تعداد قیمت دارند
  pricedSuppliers: number;
  // خط «حداقل سفارش از N | قیمت از X تا Y، بسته به تعداد» (بخش ۳۹): کمترین حداقل سفارش، و بازه‌ی همه‌ی پله‌ها
  // (null وقتی یک لیستینگ است یا همه یک قیمت‌اند)
  moqFrom: number;
  tierMin: number | null;
  tierMax: number | null;
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
// url = اندازه‌ی صفحه‌ی محصول؛ thumbUrl = عکس کوچک؛ zoomUrl = بزرگ‌نمایی. برای عکس با آدرس دستی هر سه یکی است.
export type PublicMedia = {
  kind: "image" | "video";
  url: string;
  thumbUrl: string;
  zoomUrl: string;
  posterUrl: string | null;
  alt: string;
  width: number | null;
  height: number | null;
};

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
    imageUrl: mediaUrl(row.image, "sm"),
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
  const ids = sql`array[${sql.join(
    productIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]`;

  // لیستینگ‌های فعالِ کارخانه‌های فعال (مسدود یا ادغام‌شده حساب نمی‌شوند)
  // زمان آماده‌سازی: از آخرین نوبت پله‌های lead_time_observations (migration ۰۰۰۴؛ مثل قیمت، همه‌ی ردیف‌های تا ۲ ثانیه
  // قبل از جدیدترین = یک نوبت). لیستینگی که هنوز پله ندارد، از ستون قدیمی lead_time_days (داده‌ی demo و قبلی).
  // بازه = کمترین تا بیشترین روزِ همه‌ی پله‌های همه‌ی کارخانه‌ها (مثلاً ۱۵ روز برای سفارش کم تا ۳۰ روز برای سفارش زیاد).
  const tiers = (await catalogAdminReady())
    ? sql`
      select po.listing_id, min(po.days) as lo, max(po.days) as hi
      from (select listing_id, days, observed_at, max(observed_at) over (partition by listing_id) as last_at
            from lead_time_observations) po
      where po.observed_at > po.last_at - interval '2 seconds'
      group by po.listing_id`
    : sql`select null::uuid as listing_id, null::int as lo, null::int as hi where false`;
  const listingStats = await db.execute<{ product_id: string; suppliers: number; moq_min: number | null; lt_min: number | null; lt_max: number | null }>(sql`
    with lt as (${tiers})
    select pl.product_id, count(distinct pl.company_id)::int as suppliers, min(pl.moq)::int as moq_min,
           min(coalesce(lt.lo, pl.lead_time_days))::int as lt_min, max(coalesce(lt.hi, pl.lead_time_days))::int as lt_max
    from product_listings pl
    join companies c on c.id = pl.company_id and c.status = 'active'
    left join lt on lt.listing_id = pl.id
    where pl.status = 'active' and pl.product_id = any(${ids})
    group by pl.product_id`);

  // برای هر لیستینگ فقط آخرین نوبتِ مشاهده‌ی قیمت حساب می‌شود: همه‌ی ردیف‌های تا ۲ ثانیه قبل از جدیدترین.
  // (پله‌های یک نوبت ممکن است چند میلی‌ثانیه فاصله داشته باشند، پس «برابر بودن زمان» کافی نیست؛ ولی پنجره نباید بزرگ باشد:
  // با پنجره‌ی یک ساعته، قیمتی که کارشناس چند دقیقه بعد اصلاح می‌کرد با نوبت قبلی قاطی می‌شد. پنل همه‌ی پله‌های یک نوبت را
  // با یک زمانِ واحد ثبت می‌کند؛ اکستنشن هم باید همین کار را بکند. docs/infoyaarchin.md بخش ۱۹.)
  // «میانگین» و «بازه» برای «تعداد مرجع» محصول (src/lib/pricing/reference.ts؛ بخش ۳۸): پله‌ی همان تعداد در هر لیستینگ،
  // هر کارخانه یک رأی؛ لیستینگی با حداقل سفارش بیشتر از تعداد مرجع حساب نمی‌شود. (تا 2026-11-01: وسطِ ارزان‌ترین تا گران‌ترین پله.)
  // قیمت یوانی (migration ۰۰۰۵): وقتی نرخ بازار دلار و یوان هر دو ثبت شده، یوان با نسبت «نرخ یوان ÷ نرخ دلار» به دلار
  // تبدیل و وارد میانگین می‌شود؛ وگرنه مثل قبل کنار گذاشته می‌شود. «آخرین نوبت» هر لیستینگ بین همه‌ی ارزهای قابل‌استفاده
  // حساب می‌شود (اگر کارشناس بعد از قیمت دلاری، قیمت یوانی تازه ثبت کند، قیمت یوانی ملاک است). docs/infoyaarchin.md بخش ۲۱.
  const lastRate = (code: string) => sql`(select rate_toman from exchange_rates where currency_code = ${code} and kind = 'market'
      and rate_date <= (now() at time zone 'Asia/Tehran')::date order by rate_date desc, created_at desc, id desc limit 1)`;
  const fx = (await ratesReady()) ? sql`select ${lastRate("CNY")} / ${lastRate("USD")} as cny_usd` : sql`select null::numeric as cny_usd`;
  // قیمت: پله‌های آخرین نوبت هر لیستینگ (به دلار؛ یوان با نسبت نرخ بازار)، بعد قیمت «تعداد مرجع» در reference.ts.
  const tierRows = await db.execute<{
    product_id: string;
    listing_id: string;
    company_id: string;
    moq: number | null;
    ref: string | null;
    min_qty: number | null;
    max_qty: number | null;
    lo: string;
    hi: string | null;
    at: Date;
  }>(sql`
    with fx as (${fx}), latest as (
      select po.listing_id, pl.product_id, pl.company_id, pl.moq, po.min_qty, po.max_qty,
             po.price_min * f.k as lo, po.price_max * f.k as hi, po.observed_at,
             max(po.observed_at) over (partition by po.listing_id) as last_at
      from price_observations po
      join product_listings pl on pl.id = po.listing_id and pl.status = 'active'
      join companies c on c.id = pl.company_id and c.status = 'active'
      cross join lateral (select case when po.currency = 'CNY' then (select cny_usd from fx) else 1 end as k) f
      where f.k is not null and po.currency in ('USD', 'CNY') and pl.product_id = any(${ids})
    )
    select l.product_id, l.listing_id, l.company_id, l.moq, p.meta->>'referenceQty' as ref, l.min_qty, l.max_qty, l.lo, l.hi, l.observed_at as at
    from latest l join products p on p.id = l.product_id
    where l.observed_at > l.last_at - interval '2 seconds'`);
  const byProduct = new Map<string, { ref: number | null; at: number; listings: Map<string, RefListing> }>();
  for (const r of tierRows.rows) {
    const g = byProduct.get(r.product_id) ?? { ref: r.ref && /^\d+$/.test(r.ref) ? Number(r.ref) : null, at: 0, listings: new Map() };
    const l = g.listings.get(r.listing_id) ?? { listingId: r.listing_id, companyId: r.company_id, moq: r.moq, tiers: [] };
    l.tiers.push({ minQty: r.min_qty, maxQty: r.max_qty, priceMin: Number(r.lo), priceMax: r.hi === null ? null : Number(r.hi) });
    g.listings.set(r.listing_id, l);
    g.at = Math.max(g.at, new Date(r.at).getTime());
    byProduct.set(r.product_id, g);
  }

  for (const r of listingStats.rows) {
    out.set(r.product_id, { suppliers: r.suppliers, moqMin: r.moq_min, ltMin: r.lt_min, ltMax: r.lt_max, price: null });
  }
  for (const [pid, g] of byProduct) {
    const s = out.get(pid);
    const ls = [...g.listings.values()];
    const rp = referencePrice(ls, g.ref);
    const span = orderSpan(ls);
    if (!s || !rp || !span) continue;
    // بدون گرد کردن؛ فقط در نمایش (fmtUsd)
    s.price = { currency: "USD", avg: rp.avg, min: rp.min, max: rp.max, refQty: rp.qty, pricedSuppliers: rp.suppliers, ...span, lastObservedAt: new Date(g.at).toISOString() };
  }
  return out;
}

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
      coverUrl: mediaUrl(coverOf.get(r.id), "sm"),
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

// ---------- برای بخش مشتری (علاقه‌مندی‌ها، بازدیدهای اخیر، دسته‌های مورد علاقه) ----------
// کارت محصولات منتشرشده با شناسه؛ ترتیب ورودی حفظ می‌شود (مثلاً «آخرین بازدید اول»).
export async function productCardsByIds(ids: string[]): Promise<ProductCard[]> {
  await connection();
  if (!ids.length || !(await catalogReady())) return [];
  const rows = await db
    .select(await cardColumns())
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.status, "published")));
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return toCards(rows);
}

// شناسه‌ی محصول منتشرشده از روی slug (یا null)
// قیمت تمام‌شده برای یک تعداد دلخواه، بدون connection() (دستیار: «قیمت در حداقل سفارش»؛ کارت سایت از تعداد مرجع است)
export async function loadLandedAt(slug: string, qty: number): Promise<LandedCost | null> {
  const id = await publishedProductId(slug);
  return id ? publicLandedCost(id, clampQty(qty, 1)) : null;
}

export async function publishedProductId(slug: string): Promise<string | null> {
  if (!(await catalogReady())) return null;
  const [r] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, "published")));
  return r?.id ?? null;
}

// شناسه‌ی دسته‌ی قابل‌نمایش از روی slug (یا null)
export async function visibleCategoryId(slug: string): Promise<string | null> {
  return (await getCategoryPage(slug))?.ids[0] ?? null;
}

// دسته‌های اصلی (ریشه) با شناسه؛ برای انتخاب «دسته‌های مورد علاقه»
export async function topCategoryOptions(): Promise<{ id: string; nameFa: string }[]> {
  const idx = await loadCategories();
  return (idx.children.get(null) ?? []).map((r) => ({ id: r.id, nameFa: r.nameFa }));
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
  return loadPublishedProduct(slug);
}

// همان داده‌ی عمومی صفحه‌ی محصول، بدون connection() (برای کاری که بعد از پاسخ و بیرون از رندر صفحه اجرا می‌شود، مثل دستیار هوشمند).
// مثل getProduct هیچ اطلاعات کارخانه‌ای ندارد.
export async function loadPublishedProduct(slug: string): Promise<PublicProduct | null> {
  if (!(await catalogReady())) return null;
  const [p] = await db
    .select({
      ...(await cardColumns()),
      titleEn: products.titleEn,
      descriptionFa: products.descriptionFa,
      specs: products.specs,
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
      const url = mediaUrl(m.key, "md");
      if (!url) return [];
      const img = m.kind === "image";
      return [
        {
          kind: m.kind,
          url,
          thumbUrl: (img ? mediaUrl(m.key, "sm") : mediaUrl(m.poster, "sm")) ?? url,
          zoomUrl: (img ? mediaUrl(m.key, "lg") : null) ?? url,
          posterUrl: mediaUrl(m.poster, "md"),
          alt: m.alt ?? p.titleFa,
          width: m.width,
          height: m.height,
        },
      ];
    }),
    moqMin: s?.moqMin ?? null,
    leadTimeDays: s?.ltMin != null && s?.ltMax != null ? { min: s.ltMin, max: s.ltMax } : null,
    breadcrumb: ancestors(idx, p.categoryId),
    // پیش‌فرض تعداد در کارت «قیمت تمام‌شده» = تعداد مرجع (همان تعداد قیمت کارخانه؛ بخش ۳۸)؛ مشتری در صفحه عوضش می‌کند (/api/v1/products/[slug]/landed)
    landedCost: await publicLandedCost(p.id, s?.price?.refQty ?? s?.moqMin ?? 1),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// کارت «قیمت تمام‌شده» با تعداد دلخواه مشتری (/api/v1/products/[slug]/landed). خروجی فقط عددهای گردشده‌ی جمع است؛
// قیمت یا اسم تک‌تک کارخانه‌ها در آن نیست (src/lib/pricing/compute.ts → toPublic).
export async function landedForSlug(slug: string, qtyRaw: unknown): Promise<LandedCost | null> {
  await connection();
  if (!(await catalogReady())) return null;
  const id = await publishedProductId(slug);
  if (!id) return null;
  const s = (await statsFor([id])).get(id);
  return publicLandedCost(id, clampQty(qtyRaw, s?.price?.refQty ?? s?.moqMin ?? 1));
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
