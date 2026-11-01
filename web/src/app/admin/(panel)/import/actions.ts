"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq, lt } from "drizzle-orm";
import type { FormState } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { rawPageEdits, rawPages } from "@/db/schema";
import { isBad, isBadInt, num, rows, str } from "@/lib/catalog/admin-input";
import { UNITS } from "@/lib/format";
import type { AlibabaPage, LeadTier, PriceTier } from "@/lib/import/alibaba/parse";
import { type Dims, diffEdits, type Edits } from "@/lib/import/edits";
import { registerPage } from "@/lib/import/register";
import { logActivity } from "@/lib/activity";
import { can, requirePermission } from "@/lib/auth/can";
import { PARSER_VERSION } from "@/lib/import/alibaba/parse";
import { reparse, setStatus } from "@/lib/import/service";
import { importEditsReady, importReady } from "@/lib/db-ready";

// نوشتنی‌های «ورود از علی‌بابا» (catalog.import). docs/infoyaarchin.md بخش ۳۶.
const UUID = /^[0-9a-f-]{36}$/i;
const idOf = (fd: FormData) => {
  const id = String(fd.get("id") ?? "");
  return UUID.test(id) ? id : null;
};
const done = (id: string) => {
  revalidatePath("/admin/import", "layout");
  revalidatePath(`/admin/import/${id}`);
};

export async function reviewedAction(fd: FormData): Promise<void> {
  const a = await requirePermission("catalog.import");
  const id = idOf(fd);
  if (!id || !(await importReady())) return;
  const before = await setStatus(id, "reviewed", a.user.id);
  if (before) await logActivity({ actorUserId: a.user.id, action: "import.reviewed", entityType: "raw_page", entityId: id, before: { status: before } });
  done(id);
}

export async function rejectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("catalog.import");
  const id = idOf(fd);
  if (!id || !(await importReady())) return { error: "صفحه نامعتبر است." };
  const reason = String(fd.get("reason") ?? "")
    .trim()
    .slice(0, 500);
  const before = await setStatus(id, "rejected", a.user.id, reason || null);
  if (!before) return { error: "این صفحه وارد شده و قابل رد کردن نیست." };
  await logActivity({ actorUserId: a.user.id, action: "import.reject", entityType: "raw_page", entityId: id, before: { status: before }, after: { reason } });
  done(id);
  return { ok: "رد شد." };
}

export async function restoreAction(fd: FormData): Promise<void> {
  const a = await requirePermission("catalog.import");
  const id = idOf(fd);
  if (!id || !(await importReady())) return;
  const before = await setStatus(id, "new", a.user.id);
  if (before) await logActivity({ actorUserId: a.user.id, action: "import.restore", entityType: "raw_page", entityId: id, before: { status: before } });
  done(id);
}

export async function reparseAction(fd: FormData): Promise<void> {
  const a = await requirePermission("catalog.import");
  const id = idOf(fd);
  if (!id || !(await importReady())) return;
  const r = await reparse(id);
  if (r)
    await logActivity({
      actorUserId: a.user.id,
      action: "import.reparse",
      entityType: "raw_page",
      entityId: id,
      before: { parserVersion: r.from },
      after: { parserVersion: r.to },
    });
  done(id);
}

// همه‌ی صفحه‌هایی که با خواننده‌ی قدیمی‌تر خوانده شده‌اند، یکی‌یکی (حداکثر ۲۰۰ در هر بار)
export async function reparseOldAction(): Promise<FormState> {
  const a = await requirePermission("catalog.import");
  if (!(await importReady())) return { error: "بعد از migration ۰۰۱۲." };
  const old = await db.select({ id: rawPages.id }).from(rawPages).where(lt(rawPages.parserVersion, PARSER_VERSION)).orderBy(asc(rawPages.createdAt)).limit(200);
  for (const p of old) await reparse(p.id);
  if (old.length) await logActivity({ actorUserId: a.user.id, action: "import.reparse_all", entityType: "raw_page", after: { count: old.length, parserVersion: PARSER_VERSION } });
  revalidatePath("/admin/import", "layout");
  return { ok: old.length ? `${old.length.toLocaleString("fa-IR")} صفحه دوباره خوانده شد.` : "صفحه‌ی قدیمی‌ای نیست." };
}

// ---------- اصلاح‌ها (migration ۰۰۱۳؛ بخش ۳۷) ----------
const dimsOf = (fd: FormData, p: string): Dims | null | "bad" => {
  const v = [num(fd.get(`${p}L`)), num(fd.get(`${p}W`)), num(fd.get(`${p}H`))];
  if (v.every((x) => x === null)) return null;
  return v.every((x) => x !== null && !Number.isNaN(x) && x > 0) ? { l: v[0]!, w: v[1]!, h: v[2]! } : "bad";
};

function readEdits(fd: FormData): { e: Edits } | { error: string } {
  const unit = str(fd, "unit", 20) || "piece";
  if (!UNITS[unit]) return { error: "واحد نامعتبر است." };
  const currency = fd.get("currency") === "CNY" ? "CNY" : fd.get("currency") === "USD" ? "USD" : null;
  const moq = num(fd.get("moq"));
  if (isBadInt(moq)) return { error: "حداقل سفارش باید عدد صحیح بزرگ‌تر از صفر باشد." };
  const tiers: PriceTier[] = [];
  for (const r of rows(fd, ["tierMin", "tierMax", "tierPrice", "tierPriceMax"])) {
    const [a, b, c, d] = [num(r.tierMin), num(r.tierMax), num(r.tierPrice), num(r.tierPriceMax)];
    if (a === null || c === null || isBadInt(a) || isBad(c) || isBadInt(b) || isBad(d)) return { error: "هر پله‌ی قیمت: «از تعداد» و قیمت لازم است و همه باید عدد مثبت باشند." };
    if (b !== null && b < a) return { error: "در پله‌ی قیمت «تا تعداد» از «از تعداد» کمتر است." };
    tiers.push({ minQty: a, maxQty: b, price: c, priceMax: d !== null && d > c ? d : null });
  }
  if (tiers.length && !currency) return { error: "ارز قیمت را انتخاب کنید." };
  const leads: LeadTier[] = [];
  for (const r of rows(fd, ["ltMin", "ltMax", "ltDays"])) {
    const [a, b, d] = [num(r.ltMin), num(r.ltMax), num(r.ltDays)];
    if (a === null || d === null || isBadInt(a) || isBadInt(b) || isBadInt(d) || d > 730) return { error: "هر پله‌ی زمان: «از تعداد» و روز (۱ تا ۷۳۰) لازم است." };
    leads.push({ minQty: a, maxQty: b, days: d });
  }
  const unitDims = dimsOf(fd, "unit");
  const cartonDims = dimsOf(fd, "carton");
  if (unitDims === "bad" || cartonDims === "bad") return { error: "ابعاد: هر سه عدد (طول، عرض، ارتفاع) را بزرگ‌تر از صفر بنویسید، یا هر سه را خالی بگذارید." };
  const unitWeightKg = num(fd.get("unitWeightKg"));
  const cartonWeightKg = num(fd.get("cartonWeightKg"));
  const unitsPerCarton = num(fd.get("unitsPerCarton"));
  if (isBad(unitWeightKg) || isBad(cartonWeightKg)) return { error: "وزن باید عدد بزرگ‌تر از صفر باشد (یا خالی)." };
  if (isBadInt(unitsPerCarton)) return { error: "تعداد در کارتن باید عدد صحیح بزرگ‌تر از صفر باشد (یا خالی)." };
  const e: Edits = {
    title: str(fd, "title", 300) || null,
    unit,
    moq,
    currency,
    priceTiers: tiers,
    leadTimes: leads,
    unitWeightKg,
    unitDimsCm: unitDims,
    cartonDimsCm: cartonDims,
    cartonWeightKg,
    hsCode: str(fd, "hsCode", 30) || null,
  };
  // «تعداد در کارتن» فقط وقتی اصلاح حساب می‌شود که دستی پر شده (وگرنه انتخاب «Quantity» تصمیم می‌گیرد)
  if (unitsPerCarton !== null || fd.get("unitsPerCartonTouched") === "1") e.unitsPerCarton = unitsPerCarton;
  const q = String(fd.get("qty") ?? "");
  const qn = num(fd.get(q === "other" ? "qtyOther" : "qtyValue"));
  if (q === "pack" || q === "carton" || q === "other") {
    if (qn === null || isBadInt(qn)) return { error: "برای «Quantity» عدد درست بنویسید." };
    e.qtyChoice = { kind: q, value: qn };
  }
  return { e };
}

export async function saveEditsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("catalog.import");
  const id = idOf(fd);
  if (!id || !(await importEditsReady())) return { error: "اصلاح بعد از اجرای migration ۰۰۱۳ فعال می‌شود." };
  const r = readEdits(fd);
  if ("error" in r) return r;
  const [p] = await db.select({ parsed: rawPages.parsed, status: rawPages.status }).from(rawPages).where(eq(rawPages.id, id));
  if (!p) return { error: "صفحه پیدا نشد." };
  if (p.status === "imported") return { error: "این صفحه ثبت شده؛ اصلاح بعدی از صفحه‌ی محصول و لیستینگ." };
  const data = diffEdits(p.parsed as AlibabaPage, r.e);
  await db
    .insert(rawPageEdits)
    .values({ rawPageId: id, data, updatedBy: a.user.id })
    .onConflictDoUpdate({ target: rawPageEdits.rawPageId, set: { data, updatedBy: a.user.id, updatedAt: new Date() } });
  await logActivity({ actorUserId: a.user.id, action: "import.edit", entityType: "raw_page", entityId: id, after: data });
  done(id);
  return { ok: Object.keys(data).length ? `ذخیره شد (${Object.keys(data).length.toLocaleString("fa-IR")} فیلد اصلاح‌شده).` : "ذخیره شد (بدون اصلاح؛ همه همان خوانده‌شده)." };
}

// ---------- ثبت ----------
export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("catalog.import");
  const id = idOf(fd);
  if (!id || !(await importEditsReady())) return { error: "ثبت بعد از اجرای migration ۰۰۱۳ فعال می‌شود." };
  for (const [perm, label] of [
    ["companies.view", "دیدن کارخانه‌ها"],
    ["products.manage", "مدیریت محصولات"],
  ] as const)
    if (!(await can(a.user, perm))) return { error: `ثبت دسترسی «${label}» هم می‌خواهد.` };
  const companyMode = fd.get("companyMode") === "new" ? "new" : "existing";
  if (companyMode === "new" && !(await can(a.user, "companies.manage"))) return { error: "ساخت فروشنده‌ی تازه دسترسی «ثبت و ویرایش کارخانه‌ها» می‌خواهد." };
  const companyId = str(fd, "companyId", 40);
  if (companyMode === "existing" && !UUID.test(companyId)) return { error: "فروشنده را انتخاب کنید." };
  const productMode = fd.get("productMode") === "new" ? "new" : "existing";
  const productId = str(fd, "productId", 40);
  if (productMode === "existing" && !UUID.test(productId)) return { error: "محصول را انتخاب کنید." };
  const catRaw = str(fd, "categoryId", 40);
  const newCat =
    catRaw === "new"
      ? {
          nameFa: str(fd, "newCategoryFa", 100),
          nameEn: str(fd, "newCategoryEn", 100) || null,
          parentId: UUID.test(str(fd, "newCategoryParent", 40)) ? str(fd, "newCategoryParent", 40) : null,
        }
      : null;
  if (newCat && !(await can(a.user, "categories.manage"))) return { error: "دسته‌ی تازه دسترسی «مدیریت دسته‌بندی‌ها» می‌خواهد." };
  if (newCat && newCat.nameFa.length < 2) return { error: "اسم فارسی دسته‌ی تازه را بنویسید." };
  const images = fd
    .getAll("image")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .map((n) => ({ id: n, isPublic: fd.get(`public_${n}`) === "1" }));
  const r = await registerPage(
    id,
    {
      company:
        companyMode === "new"
          ? {
              mode: "new",
              nameEn: str(fd, "companyName", 300),
              companyType: (["trading", "manufacturer"].includes(str(fd, "companyType")) ? str(fd, "companyType") : "unknown") as "trading" | "manufacturer" | "unknown",
            }
          : { mode: "existing", id: companyId },
      product:
        productMode === "new"
          ? { mode: "new", titleFa: str(fd, "titleFa", 200), slug: str(fd, "slug", 100).toLowerCase(), categoryId: UUID.test(catRaw) ? catRaw : null, newCategory: newCat }
          : { mode: "existing", id: productId, updatePacking: fd.get("updatePacking") === "1" },
      images,
    },
    a.user.id,
  );
  if (!r.ok) return { error: r.error };
  await logActivity({
    actorUserId: a.user.id,
    actingAsUserId: a.session.impersonatingUserId,
    action: "import.register",
    entityType: "raw_page",
    entityId: id,
    after: { ...r, images: images.length, companyMode, productMode },
  });
  revalidatePath("/", "layout");
  redirect(`/admin/products/${r.productId}/listings/${r.listingId}?imported=1`);
}
