"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { companies, inquiries, inquirySuppliers, products } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { can } from "@/lib/auth/can";
import { requireStaff } from "@/lib/auth/current";
import { canReply, canSee, chatAccess } from "@/lib/chat/access";
import { getConversation } from "@/lib/chat/service";
import { num, optStr, str } from "@/lib/catalog/admin-input";
import { followupReady } from "@/lib/db-ready";
import { addSupplier, createInquiry, setSupplierStatus, type SupplierStatus } from "@/lib/followup/service";

// درخواست مشتری و پیگیری کارخانه‌ها. چه کسی: کسی که در آن گفتگو پاسخ می‌دهد (کارشناس ارجاع‌گرفته)، یا chats.assign، یا ادمین.
// کار با کارخانه‌ها (اسم، افزودن، وضعیت) علاوه بر آن companies.view لازم دارد (قانون محرمانگی کارخانه‌ها). همه در لاگ فعالیت.
const NOT_READY = "جدول‌های پیگیری (migration ۰۰۰۷) هنوز ساخته نشده‌اند؛ در کنسول لیارا npm run db:migrate را اجرا کنید.";
const UUID = /^[0-9a-f-]{36}$/i;
const STATUSES = ["pending", "contacted", "replied", "quoted", "declined"] as const;

async function staffForConversation(conversationId: string) {
  const a = await requireStaff();
  if (!(await followupReady())) return { error: NOT_READY } as { error: string };
  const access = await chatAccess(a.user);
  const conv = UUID.test(conversationId) ? await getConversation(conversationId) : null;
  if (!conv || !canSee(access, conv)) return { error: "گفتگو پیدا نشد یا به آن دسترسی ندارید." } as { error: string };
  const manage = access.assign || canReply(access, { ...conv, status: "open" });
  if (!manage) return { error: "فقط کارشناس ارجاع‌گرفته‌ی همین گفتگو (یا کسی که ارجاع می‌دهد) درخواست را مدیریت می‌کند." } as { error: string };
  return { a, access, conv };
}

async function staffForInquiry(inquiryId: string, needCompanies: boolean) {
  const [inq] = UUID.test(inquiryId) ? await db.select().from(inquiries).where(eq(inquiries.id, inquiryId)) : [];
  if (!inq) return { error: "درخواست پیدا نشد." } as { error: string };
  const r = await staffForConversation(inq.conversationId);
  if ("error" in r) return r;
  if (needCompanies && !(await can(r.a.user, "companies.view")))
    return { error: "برای کار با کارخانه‌ها دسترسی «دیدن کارخانه‌ها» (companies.view) لازم است." } as { error: string };
  return { ...r, inq };
}

export async function createInquiryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await staffForConversation(str(fd, "conversationId", 40));
  if ("error" in r) return r;
  const productId = str(fd, "productId", 40) || null;
  const productTitle = optStr(fd, "productTitle", 200);
  const qty = num(fd.get("qty"));
  if (qty !== null && (!Number.isInteger(qty) || qty <= 0 || qty > 100_000_000)) return { error: "تعداد باید عدد صحیح بزرگ‌تر از صفر باشد (یا خالی)." };
  if (productId) {
    if (!UUID.test(productId)) return { error: "محصول نامعتبر است." };
    const [p] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
    if (!p) return { error: "محصول پیدا نشد." };
  } else if (!productTitle || productTitle.length < 2) return { error: "محصول را انتخاب کنید یا اسمش را بنویسید (برای محصولی که در سایت نیست)." };
  const note = optStr(fd, "note", 2000);
  const res = await createInquiry(r.conv, { productId, productTitle, qty, note }, { id: r.a.user.id, fullName: r.a.user.fullName });
  await logActivity({
    actorUserId: r.a.user.id,
    actingAsUserId: r.a.session.impersonatingUserId,
    action: "inquiry.create",
    entityType: "inquiry",
    entityId: res.id,
    after: { conversationId: r.conv.id, productId, productTitle, qty, note, suppliers: res.suppliers },
  });
  revalidatePath("/admin", "layout");
  redirect(`/admin/inquiries/${res.id}`);
}

export async function inquiryStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await staffForInquiry(str(fd, "id", 40), false);
  if ("error" in r) return r;
  const status = String(fd.get("status") ?? "");
  if (status !== "open" && status !== "done" && status !== "cancelled") return { error: "وضعیت نامعتبر است." };
  if (status === r.inq.status) return { ok: "بدون تغییر." };
  await db.update(inquiries).set({ status }).where(eq(inquiries.id, r.inq.id));
  await logActivity({ actorUserId: r.a.user.id, action: "inquiry.status", entityType: "inquiry", entityId: r.inq.id, before: { status: r.inq.status }, after: { status } });
  revalidatePath("/admin", "layout");
  return { ok: "ذخیره شد." };
}

export async function addSupplierAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await staffForInquiry(str(fd, "inquiryId", 40), true);
  if ("error" in r) return r;
  const companyId = str(fd, "companyId", 40);
  if (!UUID.test(companyId)) return { error: "کارخانه را انتخاب کنید." };
  const [co] = await db.select({ id: companies.id, nameEn: companies.nameEn }).from(companies).where(eq(companies.id, companyId));
  if (!co) return { error: "کارخانه پیدا نشد." };
  const res = await addSupplier(r.inq.id, companyId, { id: r.a.user.id, fullName: r.a.user.fullName });
  if (res === "exists") return { ok: "این کارخانه قبلاً در فهرست هست." };
  await logActivity({ actorUserId: r.a.user.id, action: "inquiry.supplier.add", entityType: "inquiry", entityId: r.inq.id, after: { companyId } });
  revalidatePath("/admin", "layout");
  return { ok: "اضافه شد." };
}

export async function supplierStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const supplierId = str(fd, "supplierId", 40);
  const [s] = UUID.test(supplierId) ? await db.select({ inquiryId: inquirySuppliers.inquiryId }).from(inquirySuppliers).where(eq(inquirySuppliers.id, supplierId)) : [];
  if (!s) return { error: "ردیف پیدا نشد." };
  const r = await staffForInquiry(s.inquiryId, true);
  if ("error" in r) return r;
  const status = String(fd.get("status") ?? "") as SupplierStatus;
  if (!(STATUSES as readonly string[]).includes(status)) return { error: "وضعیت نامعتبر است." };
  const note = optStr(fd, "note", 2000);
  const res = await setSupplierStatus(supplierId, status, note, { id: r.a.user.id, fullName: r.a.user.fullName });
  if (!res) return { error: "ردیف پیدا نشد." };
  await logActivity({
    actorUserId: r.a.user.id,
    actingAsUserId: r.a.session.impersonatingUserId,
    action: "inquiry.supplier.status",
    entityType: "inquiry",
    entityId: res.inquiryId,
    before: { companyId: res.companyId, status: res.before },
    after: { companyId: res.companyId, status, note, correspondenceId: res.correspondenceId },
  });
  revalidatePath("/admin", "layout");
  return { ok: "ثبت شد (در سابقه‌ی مکاتبه‌ی کارخانه هم ثبت شد)." };
}
