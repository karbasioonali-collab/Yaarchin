"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import {
  categories,
  companies,
  companyCategories,
  companyContacts,
  companyCorrespondence,
  companyExternalIds,
  CORRESPONDENCE_CHANNELS,
  CORRESPONDENCE_DIRECTIONS,
  CORRESPONDENCE_KINDS,
  productListings,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { can, requirePermission } from "@/lib/auth/can";
import { httpsUrl, optStr, str, tehranLocal } from "@/lib/catalog/admin-input";
import { catalogAdminReady } from "@/lib/db-ready";

// کارخانه‌ها (محرمانه؛ فقط پنل). دیدن: companies.view — ثبت و ویرایش: companies.manage — ثبت مکاتبه: correspondence.create.
// هیچ‌کدام از این جدول‌ها در src/lib/catalog/public.ts (تنها راه سایت و API عمومی به کاتالوگ) خوانده نمی‌شوند.
const UUID = /^[0-9a-f-]{36}$/i;
const NOT_READY = "این بخش بعد از اجرای migration ۰۰۰۴ فعال می‌شود (در کنسول لیارا npm run db:migrate).";
const TYPES = ["manufacturer", "trading", "unknown"] as const;

// شناسه‌ی علی‌بابا: فاصله‌ها حذف و حروف کوچک، تا «ABC 123» و «abc123» تکراری شناخته شوند
const normExt = (s: string) => s.replace(/\s+/g, "").toLowerCase().slice(0, 120);

async function companyByExternal(platform: string, externalId: string) {
  const [r] = await db
    .select({ id: companies.id, nameEn: companies.nameEn })
    .from(companyExternalIds)
    .innerJoin(companies, eq(companies.id, companyExternalIds.companyId))
    .where(and(eq(companyExternalIds.platform, platform), eq(companyExternalIds.externalId, externalId)));
  return r ?? null;
}

const dupMsg = (c: { nameEn: string; id: string }) => `این شناسه‌ی علی‌بابا قبلاً برای کارخانه‌ی «${c.nameEn}» ثبت شده است (کد ${c.id.slice(0, 8)}). همان را ویرایش کنید.`;

function readCompany(fd: FormData) {
  const nameEn = str(fd, "nameEn", 200);
  const websiteRaw = str(fd, "website", 500);
  const type = String(fd.get("companyType") ?? "");
  if (nameEn.length < 2) return { error: "نام انگلیسی کارخانه را وارد کنید." } as const;
  if (websiteRaw && !httpsUrl(websiteRaw)) return { error: "آدرس وب‌سایت باید با https:// شروع شود." } as const;
  return {
    v: {
      nameEn,
      nameFa: optStr(fd, "nameFa", 200),
      companyType: (TYPES as readonly string[]).includes(type) ? (type as (typeof TYPES)[number]) : "unknown",
      province: optStr(fd, "province", 100),
      city: optStr(fd, "city", 100),
      address: optStr(fd, "address", 500),
      website: websiteRaw ? httpsUrl(websiteRaw) : null,
      status: fd.get("status") === "blocked" ? ("blocked" as const) : ("active" as const),
      notes: optStr(fd, "notes", 5000),
    },
  } as const;
}

export async function createCompanyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("companies.manage");
  if (!(await catalogAdminReady())) return { error: NOT_READY };
  const r = readCompany(fd);
  if ("error" in r) return { error: r.error };
  const ext = normExt(str(fd, "alibabaId", 120));
  const urlRaw = str(fd, "alibabaUrl", 1000);
  if (urlRaw && !httpsUrl(urlRaw)) return { error: "لینک علی‌بابا باید با https:// شروع شود." };
  if (ext) {
    const dup = await companyByExternal("alibaba", ext);
    if (dup) return { error: dupMsg(dup) };
  }
  const id = await db.transaction(async (tx) => {
    const [c] = await tx.insert(companies).values(r.v).returning({ id: companies.id });
    if (ext) await tx.insert(companyExternalIds).values({ companyId: c.id, platform: "alibaba", externalId: ext, url: urlRaw ? httpsUrl(urlRaw) : null });
    return c.id;
  });
  await logActivity({ actorUserId: a.user.id, action: "company.create", entityType: "company", entityId: id, after: { ...r.v, alibabaId: ext || null } });
  redirect(`/admin/companies/${id}`);
}

export async function updateCompanyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("companies.manage");
  if (!(await catalogAdminReady())) return { error: NOT_READY };
  const id = str(fd, "id", 40);
  if (!UUID.test(id)) return { error: "کارخانه نامعتبر است." };
  const [before] = await db
    .select({
      nameEn: companies.nameEn,
      nameFa: companies.nameFa,
      companyType: companies.companyType,
      province: companies.province,
      city: companies.city,
      address: companies.address,
      website: companies.website,
      status: companies.status,
      notes: companies.notes,
    })
    .from(companies)
    .where(eq(companies.id, id));
  if (!before) return { error: "کارخانه پیدا نشد." };
  const r = readCompany(fd);
  if ("error" in r) return { error: r.error };
  // «ادغام‌شده» از این فرم عوض نمی‌شود
  const status = before.status === "merged" ? "merged" : r.v.status;
  await db
    .update(companies)
    .set({ ...r.v, status })
    .where(eq(companies.id, id));
  await logActivity({ actorUserId: a.user.id, action: "company.update", entityType: "company", entityId: id, before, after: { ...r.v, status } });
  revalidatePath("/", "layout");
  return { ok: "ذخیره شد." };
}

export async function addExternalIdAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("companies.manage");
  const companyId = str(fd, "companyId", 40);
  const ext = normExt(str(fd, "externalId", 120));
  const urlRaw = str(fd, "url", 1000);
  if (!UUID.test(companyId) || !ext) return { error: "شناسه‌ی علی‌بابا را وارد کنید." };
  if (urlRaw && !httpsUrl(urlRaw)) return { error: "لینک باید با https:// شروع شود." };
  const dup = await companyByExternal("alibaba", ext);
  if (dup) return { error: dup.id === companyId ? "این شناسه قبلاً برای همین کارخانه ثبت شده است." : dupMsg(dup) };
  try {
    await db.insert(companyExternalIds).values({ companyId, platform: "alibaba", externalId: ext, url: urlRaw ? httpsUrl(urlRaw) : null });
  } catch (e) {
    // ثبت هم‌زمان: ایندکس یکتای (platform، external_id) دومی را رد می‌کند
    if ((e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505")
      return { error: "این شناسه همین الان ثبت شد؛ صفحه را تازه کنید." };
    throw e;
  }
  await logActivity({
    actorUserId: a.user.id,
    action: "company.external_id.add",
    entityType: "company",
    entityId: companyId,
    after: { platform: "alibaba", externalId: ext, url: urlRaw || null },
  });
  revalidatePath(`/admin/companies/${companyId}`);
  return { ok: "اضافه شد." };
}

export async function removeExternalIdAction(fd: FormData): Promise<void> {
  const a = await requirePermission("companies.manage");
  const id = str(fd, "id", 40);
  if (!UUID.test(id)) return;
  const [row] = await db.delete(companyExternalIds).where(eq(companyExternalIds.id, id)).returning();
  if (!row) return;
  await logActivity({
    actorUserId: a.user.id,
    action: "company.external_id.remove",
    entityType: "company",
    entityId: row.companyId,
    before: { platform: row.platform, externalId: row.externalId, url: row.url },
  });
  revalidatePath(`/admin/companies/${row.companyId}`);
}

export async function setCompanyCategoriesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("companies.manage");
  const companyId = str(fd, "companyId", 40);
  if (!UUID.test(companyId)) return { error: "کارخانه نامعتبر است." };
  const wanted = [...new Set(fd.getAll("categoryIds").map(String))].filter((x) => UUID.test(x));
  const valid = wanted.length ? (await db.select({ id: categories.id }).from(categories).where(inArray(categories.id, wanted))).map((r) => r.id) : [];
  const before = (await db.select({ id: companyCategories.categoryId }).from(companyCategories).where(eq(companyCategories.companyId, companyId))).map((r) => r.id);
  await db.transaction(async (tx) => {
    await tx.delete(companyCategories).where(eq(companyCategories.companyId, companyId));
    if (valid.length) await tx.insert(companyCategories).values(valid.map((categoryId) => ({ companyId, categoryId })));
  });
  await logActivity({
    actorUserId: a.user.id,
    action: "company.categories",
    entityType: "company",
    entityId: companyId,
    before: { categoryIds: before },
    after: { categoryIds: valid },
  });
  revalidatePath(`/admin/companies/${companyId}`);
  return { ok: "دسته‌ها ذخیره شد." };
}

// تماس: ساخت (بدون id) یا ویرایش (با id)
export async function saveContactAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("companies.manage");
  if (!(await catalogAdminReady())) return { error: NOT_READY };
  const companyId = str(fd, "companyId", 40);
  const id = str(fd, "id", 40);
  const name = str(fd, "name", 120);
  if (!UUID.test(companyId)) return { error: "کارخانه نامعتبر است." };
  if (name.length < 2) return { error: "نام فرد را وارد کنید." };
  const v = {
    name,
    role: optStr(fd, "role", 120),
    phone: optStr(fd, "phone", 60),
    email: optStr(fd, "email", 200),
    wechat: optStr(fd, "wechat", 120),
    whatsapp: optStr(fd, "whatsapp", 60),
    note: optStr(fd, "note", 1000),
  };
  if (id) {
    if (!UUID.test(id)) return { error: "تماس نامعتبر است." };
    const [before] = await db
      .select()
      .from(companyContacts)
      .where(and(eq(companyContacts.id, id), eq(companyContacts.companyId, companyId)));
    if (!before) return { error: "تماس پیدا نشد." };
    await db.update(companyContacts).set(v).where(eq(companyContacts.id, id));
    await logActivity({
      actorUserId: a.user.id,
      action: "company.contact.update",
      entityType: "company",
      entityId: companyId,
      before: { ...before, createdAt: undefined, updatedAt: undefined },
      after: v,
    });
  } else {
    const [row] = await db
      .insert(companyContacts)
      .values({ companyId, ...v })
      .returning({ id: companyContacts.id });
    await logActivity({ actorUserId: a.user.id, action: "company.contact.create", entityType: "company", entityId: companyId, after: { id: row.id, ...v } });
  }
  revalidatePath(`/admin/companies/${companyId}`);
  return { ok: "ذخیره شد." };
}

export async function deleteContactAction(fd: FormData): Promise<void> {
  const a = await requirePermission("companies.manage");
  const id = str(fd, "id", 40);
  if (!UUID.test(id)) return;
  // مکاتبه‌های ثبت‌شده با این فرد می‌مانند (contact_id خالی می‌شود)
  const [row] = await db.delete(companyContacts).where(eq(companyContacts.id, id)).returning();
  if (!row) return;
  await logActivity({
    actorUserId: a.user.id,
    action: "company.contact.delete",
    entityType: "company",
    entityId: row.companyId,
    before: { name: row.name, role: row.role, phone: row.phone, email: row.email },
  });
  revalidatePath(`/admin/companies/${row.companyId}`);
}

// سابقه‌ی مکاتبه: فقط افزودنی (ویرایش و حذف ندارد؛ اصلاح = یادداشت تازه). اکستنشن بعداً با source = 'extension' همین را پر می‌کند.
export async function addCorrespondenceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("correspondence.create");
  if (!(await can(a.user, "companies.view"))) return { error: "برای ثبت مکاتبه دسترسی «دیدن کارخانه‌ها» هم لازم است." };
  if (!(await catalogAdminReady())) return { error: NOT_READY };
  const companyId = str(fd, "companyId", 40);
  const body = str(fd, "body", 20000);
  const kind = String(fd.get("kind") ?? "note");
  const channel = String(fd.get("channel") ?? "other");
  const direction = String(fd.get("direction") ?? "internal");
  const contactId = str(fd, "contactId", 40);
  const productListingId = str(fd, "listingId", 40);
  const occurredRaw = str(fd, "occurredAt", 20);
  if (!UUID.test(companyId)) return { error: "کارخانه نامعتبر است." };
  if (body.length < 3) return { error: "متن مکاتبه را وارد کنید." };
  if (!(CORRESPONDENCE_KINDS as readonly string[]).includes(kind)) return { error: "نوع نامعتبر است." };
  if (!(CORRESPONDENCE_CHANNELS as readonly string[]).includes(channel)) return { error: "کانال نامعتبر است." };
  if (!(CORRESPONDENCE_DIRECTIONS as readonly string[]).includes(direction)) return { error: "جهت نامعتبر است." };
  const occurredAt = occurredRaw ? tehranLocal(occurredRaw) : new Date();
  if (!occurredAt) return { error: "تاریخ و ساعت نامعتبر است." };
  if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) return { error: "زمان مکاتبه نمی‌تواند در آینده باشد." };

  // فرد و لیستینگ باید مال همین کارخانه باشند
  let contact: string | null = null;
  if (contactId) {
    const [c] = await db
      .select({ id: companyContacts.id })
      .from(companyContacts)
      .where(and(eq(companyContacts.id, contactId), eq(companyContacts.companyId, companyId)));
    if (!c) return { error: "فرد انتخاب‌شده مال این کارخانه نیست." };
    contact = c.id;
  }
  let listing: { id: string; productId: string | null } | null = null;
  if (productListingId) {
    const [l] = await db
      .select({ id: productListings.id, productId: productListings.productId })
      .from(productListings)
      .where(and(eq(productListings.id, productListingId), eq(productListings.companyId, companyId)));
    if (!l) return { error: "محصول انتخاب‌شده مال این کارخانه نیست." };
    listing = l;
  }
  const [row] = await db
    .insert(companyCorrespondence)
    .values({
      companyId,
      contactId: contact,
      listingId: listing?.id ?? null,
      productId: listing?.productId ?? null,
      kind: kind as (typeof CORRESPONDENCE_KINDS)[number],
      channel: channel as (typeof CORRESPONDENCE_CHANNELS)[number],
      direction: direction as (typeof CORRESPONDENCE_DIRECTIONS)[number],
      body,
      occurredAt,
      createdBy: a.user.id,
    })
    .returning({ id: companyCorrespondence.id });
  await logActivity({
    actorUserId: a.user.id,
    action: "correspondence.create",
    entityType: "company",
    entityId: companyId,
    after: { correspondenceId: row.id, kind, channel, direction, occurredAt: occurredAt.toISOString(), listingId: listing?.id ?? null, length: body.length },
  });
  revalidatePath(`/admin/companies/${companyId}`);
  return { ok: `ثبت شد (#${row.id}).` };
}
