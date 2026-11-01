import "server-only";
// «ثبت» صفحه‌ی واردشده: فروشنده، لیستینگ، قیمت‌ها، زمان آماده‌سازی، عکس‌ها و وصل به محصول (موجود یا تازه). docs/infoyaarchin.md بخش ۳۷.
// همه در یک تراکنش. عکس‌ها فایل تازه نمی‌سازند: product_media.storage_key = «/media-db/<id>» و خود بایت‌ها در raw_page_images می‌مانند
// (دیسک برنامه با استقرار پاک می‌شود؛ تا S3، عکس واردشده مستقیم از دیتابیس سرو می‌شود؛ src/app/media-db/[id]/route.ts).
import { and, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db/client";
import {
  categories,
  companies,
  companyExternalIds,
  leadTimeObservations,
  listingExternalIds,
  priceObservations,
  productListings,
  productMedia,
  products,
  rawPageEdits,
  rawPageImages,
  rawPages,
} from "@/db/schema";
import { SLUG_RE } from "@/lib/catalog/admin-input";
import { categoryIconPath, pickCategoryIcon } from "@/lib/catalog/category-icons";
import { UNITS } from "@/lib/format";
import { hsLookup } from "@/lib/pricing/admin";
import { ratesReady } from "@/lib/db-ready";
import type { AlibabaPage } from "./alibaba/parse";
import { type Edits, effective } from "./edits";

export const DB_MEDIA_PREFIX = "/media-db/";
export const dbMediaKey = (imageId: number) => `${DB_MEDIA_PREFIX}${imageId}`;

export type RegisterInput = {
  company: { mode: "existing"; id: string } | { mode: "new"; nameEn: string; companyType: "trading" | "manufacturer" | "unknown" };
  product:
    | { mode: "existing"; id: string; updatePacking: boolean }
    | { mode: "new"; titleFa: string; slug: string; categoryId: string | null; newCategory: { nameFa: string; nameEn: string | null; parentId: string | null } | null };
  images: { id: number; isPublic: boolean }[];
};
export type RegisterResult = { ok: true; productId: string; listingId: string; companyId: string; updatedListing: boolean } | { ok: false; error: string };

// slug از اسم انگلیسی («Wholesale Disposable … Ashtray» ← «wholesale-disposable-…-ashtray»)، حداکثر ۶ کلمه
export function slugify(s: string | null): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .join("-");
}

// پیشنهاد دسته: عمیق‌ترین تکه‌ی مسیر دسته‌ی علی‌بابا که با اسم انگلیسی (یا فارسی) یک دسته‌ی موجود جور است
export async function suggestCategory(p: AlibabaPage): Promise<string | null> {
  const names = [...p.categoryPath].reverse().map((x) => x.trim().toLowerCase());
  if (!names.length) return null;
  const rows = await db
    .select({ id: categories.id, en: categories.nameEn, fa: categories.nameFa })
    .from(categories)
    .where(or(...names.map((n) => ilike(categories.nameEn, n))));
  for (const n of names) {
    const hit = rows.find((r) => (r.en ?? "").toLowerCase() === n);
    if (hit) return hit.id;
  }
  return null;
}

// پیشنهاد محصول موجود: محصول‌هایی که همین فروشنده لیستینگ دارد، یا محصول‌های دسته‌ی پیشنهادی، یا هم‌کلمه با اسم انگلیسی
export async function suggestProducts(p: AlibabaPage, categoryId: string | null): Promise<{ id: string; titleFa: string; status: string }[]> {
  const words = (p.title ?? "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 5)
    .slice(0, 6);
  const conds = [
    ...(categoryId ? [eq(products.categoryId, categoryId)] : []),
    ...words.map((w) => ilike(products.titleEn, `%${w}%`)),
    ...(p.supplier.storeId
      ? [
          sql`${products.id} in (select pl.product_id from product_listings pl join company_external_ids ce on ce.company_id = pl.company_id
            where ce.platform = 'alibaba' and ce.external_id = ${p.supplier.storeId})`,
        ]
      : []),
  ];
  if (!conds.length) return [];
  return db
    .select({ id: products.id, titleFa: products.titleFa, status: products.status })
    .from(products)
    .where(or(...conds))
    .limit(20);
}

const num3 = (n: number | null) => (n === null ? null : String(n));

export async function registerPage(rawPageId: string, input: RegisterInput, by: string): Promise<RegisterResult> {
  const [page] = await db
    .select({ parsed: rawPages.parsed, status: rawPages.status, url: rawPages.url, storeId: rawPages.storeId, productId: rawPages.externalProductId })
    .from(rawPages)
    .where(eq(rawPages.id, rawPageId));
  if (!page) return { ok: false, error: "صفحه پیدا نشد." };
  if (page.status === "imported") return { ok: false, error: "این صفحه قبلاً ثبت شده است." };
  if (page.status === "rejected") return { ok: false, error: "صفحه‌ی ردشده را اول بازگردانید." };
  const p = page.parsed as AlibabaPage;
  const [ed] = await db.select({ data: rawPageEdits.data }).from(rawPageEdits).where(eq(rawPageEdits.rawPageId, rawPageId));
  const v = effective(p, (ed?.data ?? {}) as Edits);
  if (!UNITS[v.unit]) return { ok: false, error: `واحد «${v.unit}» در فهرست سایت نیست؛ در اصلاح‌ها واحد را انتخاب کنید.` };
  if (v.priceTiers.length && !v.currency) return { ok: false, error: "ارز قیمت معلوم نیست؛ در اصلاح‌ها ارز را انتخاب کنید." };
  let hsCode = v.hsCode;
  if (hsCode && (await ratesReady())) {
    const hs = await hsLookup(hsCode);
    if (!hs) return { ok: false, error: "این HS code در لیست HS نیست؛ اصلاحش کنید یا اول در «نرخ‌ها و هزینه‌ها ← HS code» ثبتش کنید." };
    hsCode = hs.code;
  }
  if (input.product.mode === "new") {
    if (input.product.titleFa.trim().length < 2) return { ok: false, error: "اسم فارسی محصول را بنویسید." };
    if (!SLUG_RE.test(input.product.slug)) return { ok: false, error: "slug فقط حروف کوچک انگلیسی، عدد و خط تیره." };
  }

  // اندازه‌ی عکس‌های انتخاب‌شده (قبل از تراکنش؛ فقط خواندن)
  const chosen = input.images.length
    ? await db
        .select({ id: rawPageImages.id, bytes: rawPageImages.bytes, position: rawPageImages.position })
        .from(rawPageImages)
        .where(
          and(
            eq(rawPageImages.rawPageId, rawPageId),
            inArray(
              rawPageImages.id,
              input.images.map((i) => i.id),
            ),
          ),
        )
    : [];
  const dims = new Map<number, { w: number | null; h: number | null }>();
  for (const c of chosen) {
    const m = c.bytes
      ? await sharp(c.bytes)
          .metadata()
          .catch(() => null)
      : null;
    dims.set(c.id, { w: m?.width ?? null, h: m?.height ?? null });
  }

  try {
    return await db.transaction(async (tx) => {
      // ---- فروشنده
      let companyId: string;
      const [byStore] = page.storeId
        ? await tx
            .select({ id: companyExternalIds.companyId })
            .from(companyExternalIds)
            .where(and(eq(companyExternalIds.platform, "alibaba"), eq(companyExternalIds.externalId, page.storeId)))
        : [];
      if (input.company.mode === "existing") {
        const [c] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, input.company.id));
        if (!c) throw new UserError("فروشنده پیدا نشد.");
        companyId = c.id;
        if (page.storeId && !byStore) await tx.insert(companyExternalIds).values({ companyId, platform: "alibaba", externalId: page.storeId, url: p.supplier.profileUrl });
      } else {
        if (byStore) throw new UserError("این فروشنده (شناسه‌ی فروشگاه) قبلاً ثبت شده؛ «فروشنده‌ی موجود» را انتخاب کنید.");
        const s = p.supplier;
        const [c] = await tx
          .insert(companies)
          .values({
            nameEn: input.company.nameEn.trim().slice(0, 300) || "Unknown supplier",
            companyType: input.company.companyType,
            country: s.country ?? "CN",
            source: "import",
            meta: {
              alibaba: {
                storeId: s.storeId,
                yearsOnAlibaba: s.years,
                foundedYear: s.foundedYear,
                rating: s.rating,
                revenue: s.revenue,
                responseTime: s.responseTime,
                onTimeRate: s.onTimeRate,
                topBuyers: s.topBuyers,
                avgDispatchDays: s.avgDispatchDays,
                about: s.about,
              },
            },
          })
          .returning({ id: companies.id });
        companyId = c.id;
        if (page.storeId) await tx.insert(companyExternalIds).values({ companyId, platform: "alibaba", externalId: page.storeId, url: s.profileUrl });
      }

      // ---- محصول
      let productId: string;
      const packingCols = {
        unitWeightKg: num3(v.packing.unitWeightKg),
        cartonLengthCm: num3(v.packing.cartonDimsCm?.l ?? null),
        cartonWidthCm: num3(v.packing.cartonDimsCm?.w ?? null),
        cartonHeightCm: num3(v.packing.cartonDimsCm?.h ?? null),
        cartonWeightKg: num3(v.packing.cartonWeightKg),
        unitsPerCarton: v.packing.unitsPerCarton,
      };
      if (input.product.mode === "existing") {
        const [pr] = await tx.select({ id: products.id, hsCode: products.hsCode }).from(products).where(eq(products.id, input.product.id));
        if (!pr) throw new UserError("محصول پیدا نشد.");
        productId = pr.id;
        if (input.product.updatePacking)
          await tx
            .update(products)
            .set({ ...packingCols, ...(hsCode ? { hsCode } : {}) })
            .where(eq(products.id, productId));
        else if (hsCode && !pr.hsCode) await tx.update(products).set({ hsCode }).where(eq(products.id, productId));
      } else {
        const np = input.product;
        const [dup] = await tx.select({ id: products.id }).from(products).where(eq(products.slug, np.slug));
        if (dup) throw new UserError("این slug قبلاً برای محصول دیگری استفاده شده است.");
        let categoryId = np.categoryId;
        if (np.newCategory) {
          const slug = slugify(np.newCategory.nameEn) || `cat-${Date.now().toString(36)}`;
          // آیکون گرافیکی خودکار (بخش ۳۸): از اسم، مسیر دسته‌ی علی‌بابا و آیکون والد؛ هرگز عکس محصول
          const [parent] = np.newCategory.parentId ? await tx.select({ image: categories.image }).from(categories).where(eq(categories.id, np.newCategory.parentId)) : [];
          const image = categoryIconPath(
            pickCategoryIcon({ nameFa: np.newCategory.nameFa, nameEn: np.newCategory.nameEn, path: p.categoryPath, parentImage: parent?.image ?? null }),
          );
          const [cat] = await tx
            .insert(categories)
            .values({
              nameFa: np.newCategory.nameFa,
              nameEn: np.newCategory.nameEn,
              parentId: np.newCategory.parentId,
              slug,
              status: "active",
              source: "import",
              image,
              meta: { autoIcon: true },
            })
            .returning({ id: categories.id });
          categoryId = cat.id;
        }
        const [pr] = await tx
          .insert(products)
          .values({
            slug: np.slug,
            titleFa: np.titleFa.trim(),
            titleEn: v.title,
            categoryId,
            priceUnit: v.unit,
            hsCode,
            status: "draft",
            source: "import",
            createdBy: by,
            ...packingCols,
          })
          .returning({ id: products.id });
        productId = pr.id;
      }

      // ---- لیستینگ (همین شناسه‌ی محصول علی‌بابا ← همان لیستینگ به‌روز می‌شود)
      const specs = { attributes: p.attributes, options: p.options, customization: p.customization, placeOfOrigin: p.placeOfOrigin, packQty: v.packQty, highlights: p.highlights };
      const meta = { rawPageId, categoryPath: p.categoryPath, packing: v.packing };
      const [linked] = page.productId
        ? await tx
            .select({ listingId: listingExternalIds.listingId, productId: productListings.productId })
            .from(listingExternalIds)
            .innerJoin(productListings, eq(productListings.id, listingExternalIds.listingId))
            .where(and(eq(listingExternalIds.platform, "alibaba"), eq(listingExternalIds.externalId, page.productId)))
        : [];
      let listingId: string;
      if (linked) {
        if (linked.productId && linked.productId !== productId) throw new UserError("این محصول علی‌بابا قبلاً به محصول دیگری از سایت وصل شده است؛ همان محصول را انتخاب کنید.");
        listingId = linked.listingId;
        await tx
          .update(productListings)
          .set({ productId, companyId, externalUrl: page.url, titleEn: v.title, moq: v.moq, moqUnit: v.unit, specs, meta, status: "active" })
          .where(eq(productListings.id, listingId));
      } else {
        const [l] = await tx
          .insert(productListings)
          .values({ productId, companyId, externalUrl: page.url, titleEn: v.title, moq: v.moq, moqUnit: v.unit, specs, meta, source: "import" })
          .returning({ id: productListings.id });
        listingId = l.id;
        if (page.productId) await tx.insert(listingExternalIds).values({ listingId, platform: "alibaba", externalId: page.productId, url: page.url });
      }

      // ---- قیمت‌ها و زمان آماده‌سازی: یک نوبت با زمان واحد (قبلی‌ها دست نمی‌خورند)
      const at = new Date();
      if (v.priceTiers.length && v.currency)
        await tx.insert(priceObservations).values(
          v.priceTiers.map((t) => ({
            listingId,
            observedAt: at,
            currency: v.currency!,
            unit: v.unit,
            minQty: t.minQty,
            maxQty: t.maxQty,
            priceMin: String(t.price),
            priceMax: t.priceMax === null ? null : String(t.priceMax),
            source: "import",
            rawPageId,
            createdBy: by,
          })),
        );
      if (v.leadTimes.length)
        await tx
          .insert(leadTimeObservations)
          .values(
            v.leadTimes.map((t) => ({ listingId, observedAt: at, minQty: t.minQty, maxQty: t.maxQty, days: t.days, source: "import", note: "ورود از علی‌بابا", createdBy: by })),
          );

      // ---- عکس‌ها: بدون فایل تازه؛ کلید «/media-db/<id>»
      if (chosen.length) {
        const [{ n }] = await tx.select({ n: count() }).from(productMedia).where(eq(productMedia.productId, productId));
        const pub = new Map(input.images.map((i) => [i.id, i.isPublic]));
        const existing = new Set(
          (
            await tx
              .select({ k: productMedia.storageKey })
              .from(productMedia)
              .where(
                and(
                  eq(productMedia.productId, productId),
                  inArray(
                    productMedia.storageKey,
                    chosen.map((c) => dbMediaKey(c.id)),
                  ),
                ),
              )
          ).map((r) => r.k),
        );
        const fresh = chosen.filter((c) => !existing.has(dbMediaKey(c.id))).sort((a, b) => a.position - b.position);
        if (fresh.length)
          await tx.insert(productMedia).values(
            fresh.map((c, i) => ({
              productId,
              listingId,
              kind: "image" as const,
              storageKey: dbMediaKey(c.id),
              width: dims.get(c.id)?.w ?? null,
              height: dims.get(c.id)?.h ?? null,
              isPublic: pub.get(c.id) ?? false,
              sortOrder: n + i,
              source: "import",
            })),
          );
      }

      await tx.update(rawPages).set({ status: "imported", companyId, productId, listingId }).where(eq(rawPages.id, rawPageId));
      return { ok: true as const, productId, listingId, companyId, updatedListing: !!linked };
    });
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
}

class UserError extends Error {}
