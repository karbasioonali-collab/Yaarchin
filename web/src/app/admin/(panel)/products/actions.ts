"use server";

import { and, asc, count, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { companies, leadTimeObservations, priceObservations, productListings, productMedia, products } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { can, requirePermission } from "@/lib/auth/can";
import { httpsUrl, isBad, isBadInt, num, optStr, rows, SLUG_RE, str, type Tier, tierError } from "@/lib/catalog/admin-input";
import { categoryExists } from "@/lib/catalog/admin-tree";
import { UNITS } from "@/lib/format";
import { fmtImportScore, IMPORT_SCORES, toImportScore } from "@/lib/catalog/import-score";
import { catalogAdminReady, importScoreReady } from "@/lib/db-ready";

// ثبت/ویرایش امتیاز «جذاب برای واردات». فقط با دسترسی products.rate (ادمین همیشه).
// مقدار فقط از فهرست مجاز پذیرفته می‌شود؛ دیتابیس هم با CHECK constraint همین را کنترل می‌کند.
export async function setImportScoreAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("products.rate");
  if (!(await importScoreReady())) return { error: "ستون امتیاز هنوز ساخته نشده؛ در کنسول لیارا npm run db:migrate را اجرا کنید." };

  const id = String(fd.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "محصول نامعتبر است." };
  const raw = String(fd.get("score") ?? "").trim();
  const score = toImportScore(raw);
  // «خالی» یعنی حذف امتیاز؛ هر چیز دیگری که در فهرست نیست رد می‌شود (نه اینکه بی‌صدا null شود)
  if (raw !== "" && score === null) {
    return { error: `امتیاز فقط یکی از این‌هاست: ${IMPORT_SCORES.map((x) => fmtImportScore(x)).join("، ")}.` };
  }

  const [p] = await db.select({ importScore: products.importScore, titleFa: products.titleFa }).from(products).where(eq(products.id, id));
  if (!p) return { error: "محصول پیدا نشد." };
  const before = toImportScore(p.importScore);
  if (before === score) return { ok: "بدون تغییر." };

  await db.update(products).set({ importScore: score === null ? null : String(score) }).where(eq(products.id, id));
  await logActivity({
    actorUserId: a.user.id,
    actingAsUserId: a.session.impersonatingUserId,
    action: "product.import_score",
    entityType: "product",
    entityId: id,
    before: { importScore: before, title: p.titleFa },
    after: { importScore: score },
  });
  revalidatePath("/", "layout");
  return { ok: `ذخیره شد: ${fmtImportScore(before)} ← ${fmtImportScore(score)}` };
}

// ---------- مدیریت محصول (products.manage) ----------
// قیمت و زمان آماده‌سازی فقط افزودنی‌اند: «ثبت نوبت تازه» ردیف‌های تازه می‌سازد و نوبت‌های قبلی به‌عنوان سابقه می‌مانند.
// قیمت فقط به ارز اصلی (دلار یا یوان) ذخیره می‌شود؛ تومان و قیمت تمام‌شده هر بار با آخرین نرخ‌ها حساب می‌شود (lib/pricing/landed.ts).
const UUID = /^[0-9a-f-]{36}$/i;
const NOT_READY = "این بخش بعد از اجرای migration ۰۰۰۴ فعال می‌شود (در کنسول لیارا npm run db:migrate).";

type ProductInput = {
  titleFa: string;
  titleEn: string | null;
  slug: string;
  categoryId: string | null;
  summaryFa: string | null;
  descriptionFa: string | null;
  priceUnit: string;
  hsCode: string | null;
  status: "draft" | "published" | "archived";
};

async function readProduct(fd: FormData, selfId?: string): Promise<{ error: string } | { v: ProductInput }> {
  const titleFa = str(fd, "titleFa", 200);
  const slug = str(fd, "slug", 100).toLowerCase();
  const cat = str(fd, "categoryId", 40);
  const unit = str(fd, "priceUnit", 20) || "piece";
  const status = String(fd.get("status") ?? "draft");
  if (titleFa.length < 2) return { error: "نام فارسی محصول را وارد کنید." };
  if (!SLUG_RE.test(slug)) return { error: "slug فقط حروف کوچک انگلیسی، عدد و خط تیره (مثل portable-blender)." };
  if (!UNITS[unit]) return { error: "واحد قیمت نامعتبر است." };
  if (!["draft", "published", "archived"].includes(status)) return { error: "وضعیت نامعتبر است." };
  if (cat && !(UUID.test(cat) && (await categoryExists(cat)))) return { error: "دسته پیدا نشد." };
  const [dup] = await db.select({ id: products.id }).from(products).where(selfId ? and(eq(products.slug, slug), ne(products.id, selfId)) : eq(products.slug, slug));
  if (dup) return { error: "این slug قبلاً برای محصول دیگری استفاده شده است." };
  return {
    v: {
      titleFa,
      titleEn: optStr(fd, "titleEn", 300),
      slug,
      categoryId: cat || null,
      summaryFa: optStr(fd, "summaryFa", 500),
      descriptionFa: optStr(fd, "descriptionFa", 10000),
      priceUnit: unit,
      hsCode: optStr(fd, "hsCode", 20),
      status: status as ProductInput["status"],
    },
  };
}

export async function createProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("products.manage");
  const r = await readProduct(fd);
  if ("error" in r) return r;
  const [row] = await db
    .insert(products)
    .values({ ...r.v, createdBy: a.user.id, publishedAt: r.v.status === "published" ? new Date() : null })
    .returning({ id: products.id });
  await logActivity({ actorUserId: a.user.id, action: "product.create", entityType: "product", entityId: row.id, after: r.v });
  revalidatePath("/", "layout");
  redirect(`/admin/products/${row.id}`);
}

export async function updateProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("products.manage");
  const id = str(fd, "id", 40);
  if (!UUID.test(id)) return { error: "محصول نامعتبر است." };
  const ready = await catalogAdminReady();
  const [before] = await db
    .select({
      titleFa: products.titleFa,
      titleEn: products.titleEn,
      slug: products.slug,
      categoryId: products.categoryId,
      summaryFa: products.summaryFa,
      descriptionFa: products.descriptionFa,
      priceUnit: products.priceUnit,
      hsCode: products.hsCode,
      status: products.status,
      specs: products.specs,
      publishedAt: products.publishedAt,
      ...(ready ? PACKING_COLS : {}),
    })
    .from(products)
    .where(eq(products.id, id));
  if (!before) return { error: "محصول پیدا نشد." };
  const r = await readProduct(fd, id);
  if ("error" in r) return r;

  // مشخصات مشترک: ردیف‌های «عنوان | مقدار | واحد»
  const specRows = rows(fd, ["specLabel", "specValue", "specUnit"]);
  if (specRows.some((s) => !s.specLabel || !s.specValue)) return { error: "در مشخصات، هر ردیف هم عنوان و هم مقدار لازم دارد." };
  const specs = specRows.slice(0, 60).map((s) => ({ labelFa: s.specLabel.slice(0, 80), valueFa: s.specValue.slice(0, 200), ...(s.specUnit ? { unit: s.specUnit.slice(0, 40) } : {}) }));

  // وزن و بسته‌بندی (ماشین‌حساب مرحله‌ی نرخ‌ها)
  let packing: Record<string, string | number | null> = {};
  if (ready) {
    const vals = {
      unitWeightKg: num(fd.get("unitWeightKg")),
      cartonLengthCm: num(fd.get("cartonLengthCm")),
      cartonWidthCm: num(fd.get("cartonWidthCm")),
      cartonHeightCm: num(fd.get("cartonHeightCm")),
      cartonWeightKg: num(fd.get("cartonWeightKg")),
    };
    const upc = num(fd.get("unitsPerCarton"));
    if (Object.values(vals).some(isBad)) return { error: "وزن و ابعاد باید عدد بزرگ‌تر از صفر باشند (یا خالی)." };
    if (isBadInt(upc)) return { error: "تعداد در کارتن باید عدد صحیح بزرگ‌تر از صفر باشد (یا خالی)." };
    packing = { ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v === null ? null : String(v)])), unitsPerCarton: upc };
  }

  const publishedAt = r.v.status === "published" && !before.publishedAt ? new Date() : before.publishedAt;
  await db.update(products).set({ ...r.v, ...packing, specs, publishedAt }).where(eq(products.id, id));
  await logActivity({ actorUserId: a.user.id, action: "product.update", entityType: "product", entityId: id, before, after: { ...r.v, ...packing, specs } });
  revalidatePath("/", "layout");
  return { ok: "ذخیره شد." };
}

const PACKING_COLS = {
  unitWeightKg: products.unitWeightKg,
  cartonLengthCm: products.cartonLengthCm,
  cartonWidthCm: products.cartonWidthCm,
  cartonHeightCm: products.cartonHeightCm,
  cartonWeightKg: products.cartonWeightKg,
  unitsPerCarton: products.unitsPerCarton,
};

// ---------- عکس و ویدیو (فعلاً با آدرس؛ آپلود در مرحله‌ی بعد) ----------
export async function addMediaAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("products.manage");
  const productId = str(fd, "productId", 40);
  const url = httpsUrl(str(fd, "url", 1000));
  const posterRaw = str(fd, "poster", 1000);
  const kind = fd.get("kind") === "video" ? "video" : "image";
  const listingId = str(fd, "listingId", 40);
  if (!UUID.test(productId)) return { error: "محصول نامعتبر است." };
  if (!url) return { error: "آدرس فایل باید با https:// شروع شود." };
  if (posterRaw && !httpsUrl(posterRaw)) return { error: "آدرس عکس پیش‌نمایش باید با https:// شروع شود." };
  if (listingId) {
    const [l] = await db.select({ id: productListings.id }).from(productListings).where(and(eq(productListings.id, listingId), eq(productListings.productId, productId)));
    if (!l) return { error: "لیستینگ انتخاب‌شده مال این محصول نیست." };
  }
  const [{ n }] = await db.select({ n: count() }).from(productMedia).where(eq(productMedia.productId, productId));
  // «دارای لوگوی کارخانه — منتشر نشود» ← is_public = false (سایت فقط is_public = true را نشان می‌دهد)
  const hasLogo = fd.get("hasLogo") === "yes";
  const v = { productId, kind, storageKey: url, posterKey: posterRaw ? httpsUrl(posterRaw) : null, altFa: optStr(fd, "altFa", 200), isPublic: !hasLogo, listingId: listingId || null, sortOrder: n } as const;
  const [row] = await db.insert(productMedia).values(v).returning({ id: productMedia.id });
  await logActivity({ actorUserId: a.user.id, action: "product.media.add", entityType: "product", entityId: productId, after: { id: row.id, ...v } });
  revalidatePath("/", "layout");
  return { ok: hasLogo ? "اضافه شد (منتشر نمی‌شود: دارای لوگوی کارخانه)." : "اضافه شد." };
}

export async function mediaCommandAction(fd: FormData): Promise<void> {
  const a = await requirePermission("products.manage");
  const id = str(fd, "id", 40);
  const cmd = String(fd.get("cmd") ?? "");
  if (!UUID.test(id)) return;
  const [m] = await db.select().from(productMedia).where(eq(productMedia.id, id));
  if (!m) return;
  if (cmd === "toggle") {
    await db.update(productMedia).set({ isPublic: !m.isPublic }).where(eq(productMedia.id, id));
    await logActivity({ actorUserId: a.user.id, action: "product.media.visibility", entityType: "product", entityId: m.productId, before: { id, isPublic: m.isPublic }, after: { id, isPublic: !m.isPublic } });
  } else if (cmd === "delete") {
    await db.delete(productMedia).where(eq(productMedia.id, id));
    await logActivity({ actorUserId: a.user.id, action: "product.media.delete", entityType: "product", entityId: m.productId, before: { id, kind: m.kind, url: m.storageKey, isPublic: m.isPublic } });
  } else if (cmd === "up" || cmd === "down") {
    const all = await db.select({ id: productMedia.id }).from(productMedia).where(eq(productMedia.productId, m.productId)).orderBy(asc(productMedia.sortOrder), asc(productMedia.createdAt));
    const i = all.findIndex((x) => x.id === id);
    const j = cmd === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    await db.transaction(async (tx) => {
      for (const [k, x] of all.entries()) await tx.update(productMedia).set({ sortOrder: k }).where(eq(productMedia.id, x.id));
    });
    await logActivity({ actorUserId: a.user.id, action: "product.media.reorder", entityType: "product", entityId: m.productId, after: { order: all.map((x) => x.id) } });
  }
  revalidatePath("/", "layout");
}

// ---------- لیستینگ هر کارخانه برای محصول ----------
function readListing(fd: FormData) {
  const urlRaw = str(fd, "externalUrl", 1000);
  const moq = num(fd.get("moq"));
  if (urlRaw && !httpsUrl(urlRaw)) return { error: "لینک علی‌بابا باید با https:// شروع شود." } as const;
  if (isBadInt(moq)) return { error: "حداقل سفارش باید عدد صحیح بزرگ‌تر از صفر باشد (یا خالی)." } as const;
  const unit = str(fd, "moqUnit", 20) || "piece";
  if (!UNITS[unit]) return { error: "واحد نامعتبر است." } as const;
  return {
    v: { externalUrl: urlRaw ? httpsUrl(urlRaw) : null, titleEn: optStr(fd, "titleEn", 300), moq, moqUnit: unit, status: fd.get("status") === "inactive" ? ("inactive" as const) : ("active" as const) },
  } as const;
}

export async function createListingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("products.manage");
  if (!(await can(a.user, "companies.view"))) return { error: "برای انتخاب کارخانه دسترسی «دیدن کارخانه‌ها» هم لازم است." };
  const productId = str(fd, "productId", 40);
  const companyId = str(fd, "companyId", 40);
  if (!UUID.test(productId) || !UUID.test(companyId)) return { error: "محصول یا کارخانه نامعتبر است." };
  const [co] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId));
  if (!co) return { error: "کارخانه پیدا نشد." };
  const r = readListing(fd);
  if ("error" in r) return { error: r.error };
  const [row] = await db.insert(productListings).values({ productId, companyId, ...r.v }).returning({ id: productListings.id });
  await logActivity({ actorUserId: a.user.id, action: "listing.create", entityType: "product", entityId: productId, after: { listingId: row.id, companyId, ...r.v } });
  revalidatePath("/", "layout");
  redirect(`/admin/products/${productId}/listings/${row.id}`);
}

export async function updateListingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("products.manage");
  const id = str(fd, "id", 40);
  if (!UUID.test(id)) return { error: "لیستینگ نامعتبر است." };
  const [before] = await db
    .select({ productId: productListings.productId, externalUrl: productListings.externalUrl, titleEn: productListings.titleEn, moq: productListings.moq, moqUnit: productListings.moqUnit, status: productListings.status })
    .from(productListings)
    .where(eq(productListings.id, id));
  if (!before) return { error: "لیستینگ پیدا نشد." };
  const r = readListing(fd);
  if ("error" in r) return { error: r.error };
  await db.update(productListings).set(r.v).where(eq(productListings.id, id));
  await logActivity({ actorUserId: a.user.id, action: "listing.update", entityType: "product", entityId: before.productId ?? undefined, before: { listingId: id, ...before }, after: r.v });
  revalidatePath("/", "layout");
  return { ok: "ذخیره شد." };
}

// نوبت تازه‌ی قیمت: همه‌ی پله‌ها با یک زمان ثبت می‌شوند. قیمت‌های قبلی دست نمی‌خورند.
export async function addPriceBatchAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("products.manage");
  const listingId = str(fd, "listingId", 40);
  const currency = String(fd.get("currency") ?? "");
  if (!UUID.test(listingId)) return { error: "لیستینگ نامعتبر است." };
  if (currency !== "USD" && currency !== "CNY") return { error: "ارز فقط دلار یا یوان." };
  const [l] = await db
    .select({ productId: productListings.productId, unit: products.priceUnit })
    .from(productListings)
    .leftJoin(products, eq(products.id, productListings.productId))
    .where(eq(productListings.id, listingId));
  if (!l) return { error: "لیستینگ پیدا نشد." };
  const tiers = rows(fd, ["tierMin", "tierMax", "priceMin", "priceMax"]).map((t) => ({
    minQty: num(t.tierMin),
    maxQty: num(t.tierMax),
    priceMin: num(t.priceMin),
    priceMax: num(t.priceMax),
  }));
  if (!tiers.length) return { error: "حداقل یک ردیف قیمت وارد کنید." };
  for (const t of tiers) {
    if (t.priceMin === null || isBad(t.priceMin) || isBad(t.priceMax)) return { error: "قیمت باید عدد بزرگ‌تر از صفر باشد." };
    if (t.priceMax !== null && t.priceMax < t.priceMin) return { error: "در هر ردیف «قیمت تا» نباید کمتر از «قیمت» باشد." };
    if (isBadInt(t.minQty) || isBadInt(t.maxQty)) return { error: "تعداد پله باید عدد صحیح بزرگ‌تر از صفر باشد." };
  }
  const te = tierError(tiers as Tier[]);
  if (te) return { error: te };
  const observedAt = new Date();
  const note = optStr(fd, "note", 500);
  await db.insert(priceObservations).values(
    tiers.map((t) => ({
      listingId,
      observedAt,
      currency,
      unit: l.unit ?? "piece",
      minQty: t.minQty,
      maxQty: t.maxQty,
      priceMin: String(t.priceMin),
      priceMax: t.priceMax === null ? null : String(t.priceMax),
      note,
      createdBy: a.user.id,
    })),
  );
  await logActivity({ actorUserId: a.user.id, action: "price.add", entityType: "product", entityId: l.productId ?? undefined, after: { listingId, currency, tiers, note } });
  revalidatePath("/", "layout");
  return { ok: currency === "CNY" ? "ثبت شد. قیمت یوانی تا مرحله‌ی نرخ‌ها در میانگین سایت حساب نمی‌شود." : "ثبت شد." };
}

export async function addLeadTimeBatchAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("products.manage");
  if (!(await catalogAdminReady())) return { error: NOT_READY };
  const listingId = str(fd, "listingId", 40);
  if (!UUID.test(listingId)) return { error: "لیستینگ نامعتبر است." };
  const [l] = await db.select({ productId: productListings.productId }).from(productListings).where(eq(productListings.id, listingId));
  if (!l) return { error: "لیستینگ پیدا نشد." };
  const tiers = rows(fd, ["ltMin", "ltMax", "ltDays"]).map((t) => ({ minQty: num(t.ltMin), maxQty: num(t.ltMax), days: num(t.ltDays) }));
  if (!tiers.length) return { error: "حداقل یک ردیف وارد کنید." };
  for (const t of tiers) {
    if (t.days === null || isBadInt(t.days) || t.days > 730) return { error: "تعداد روز باید عدد صحیح بین ۱ و ۷۳۰ باشد." };
    if (isBadInt(t.minQty) || isBadInt(t.maxQty)) return { error: "تعداد پله باید عدد صحیح بزرگ‌تر از صفر باشد." };
  }
  const te = tierError(tiers as Tier[]);
  if (te) return { error: te };
  const observedAt = new Date();
  const note = optStr(fd, "note", 500);
  await db.insert(leadTimeObservations).values(tiers.map((t) => ({ listingId, observedAt, minQty: t.minQty, maxQty: t.maxQty, days: t.days as number, note, createdBy: a.user.id })));
  await logActivity({ actorUserId: a.user.id, action: "lead_time.add", entityType: "product", entityId: l.productId ?? undefined, after: { listingId, tiers, note } });
  revalidatePath("/", "layout");
  return { ok: "ثبت شد." };
}
