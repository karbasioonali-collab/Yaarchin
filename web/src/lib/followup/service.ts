import "server-only";
// پیگیری کارخانه‌ها برای هر درخواست مشتری (migration ۰۰۰۷). docs/infoyaarchin.md بخش ۲۵.
//   - درخواست از داخل چت ساخته می‌شود (محصول، تعداد، توضیح) و یک رویداد داخلی در همان چت ثبت می‌کند.
//   - کارخانه‌هایی که برای آن محصول لیستینگ فعال دارند خودکار با وضعیت «در انتظار» اضافه می‌شوند؛ کارخانه‌ی دیگر دستی.
//   - هر تغییر وضعیت (پیام داده شد / جواب داد / قیمت گرفته شد / رد شد) فقط افزودنی است (inquiry_supplier_events) و
//     همزمان یک ردیف در سابقه‌ی مکاتبه‌ی همان کارخانه (company_correspondence) می‌سازد؛ پس از صفحه‌ی کارخانه هم دیده می‌شود.
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { chatMessages, companies, companyCorrespondence, conversations, inquiries, inquirySupplierEvents, inquirySuppliers, productListings, products } from "@/db/schema";

export type SupplierStatus = "pending" | "contacted" | "replied" | "quoted" | "declined";
export const SUPPLIER_STATUS_FA: Record<SupplierStatus, string> = {
  pending: "در انتظار",
  contacted: "پیام داده شد",
  replied: "جواب داد",
  quoted: "قیمت گرفته شد",
  declined: "رد شد",
};
export const INQUIRY_STATUS_FA: Record<string, string> = { open: "باز", done: "انجام‌شده", cancelled: "لغوشده" };
// جهت ردیف سابقه‌ی مکاتبه: «پیام داده شد» از ما به کارخانه؛ بقیه پاسخ کارخانه
const DIRECTION: Record<SupplierStatus, "outbound" | "inbound" | "internal"> = {
  pending: "internal",
  contacted: "outbound",
  replied: "inbound",
  quoted: "inbound",
  declined: "inbound",
};
export const shortId = (id: string) => id.slice(0, 8);

type Who = { id: string; fullName: string };

export async function createInquiry(
  conv: typeof conversations.$inferSelect,
  v: { productId: string | null; productTitle: string | null; qty: number | null; note: string | null },
  by: Who,
): Promise<{ id: string; suppliers: number }> {
  return db.transaction(async (tx) => {
    // اسم محصول همیشه هم ذخیره می‌شود (عکس لحظه‌ی ساخت)؛ اگر محصول روزی حذف شود (product_id ← null) درخواست بی‌نام نمی‌ماند
    // و CHECK «محصول یا اسم» نمی‌شکند.
    const [p] = v.productId ? await tx.select({ t: products.titleFa }).from(products).where(eq(products.id, v.productId)) : [];
    const [inq] = await tx
      .insert(inquiries)
      .values({ conversationId: conv.id, productId: v.productId, productTitle: p?.t ?? v.productTitle, qty: v.qty, note: v.note, createdBy: by.id })
      .returning({ id: inquiries.id });
    let n = 0;
    if (v.productId) {
      // از هر کارخانه‌ی فعال یک لیستینگ فعال این محصول (اولین)
      const ls = await tx
        .selectDistinctOn([productListings.companyId], { companyId: productListings.companyId, listingId: productListings.id })
        .from(productListings)
        .innerJoin(companies, and(eq(companies.id, productListings.companyId), eq(companies.status, "active")))
        .where(and(eq(productListings.productId, v.productId), eq(productListings.status, "active")))
        .orderBy(productListings.companyId, asc(productListings.createdAt));
      if (ls.length) {
        await tx.insert(inquirySuppliers).values(ls.map((l) => ({ inquiryId: inq.id, companyId: l.companyId, listingId: l.listingId, createdBy: by.id })));
        n = ls.length;
      }
    }
    await tx.insert(chatMessages).values({
      conversationId: conv.id,
      senderType: "system",
      senderUserId: by.id,
      kind: "event",
      body: `${by.fullName} درخواست #${shortId(inq.id)} را ساخت${v.qty ? ` (${v.qty.toLocaleString("fa-IR")} عدد)` : ""}؛ پیگیری کارخانه‌ها در صفحه‌ی درخواست.`,
      visibleToCustomer: false,
      meta: { event: "inquiry", inquiryId: inq.id },
    });
    return { id: inq.id, suppliers: n };
  });
}

export async function addSupplier(inquiryId: string, companyId: string, by: Who): Promise<"added" | "exists"> {
  const [inq] = await db.select({ productId: inquiries.productId }).from(inquiries).where(eq(inquiries.id, inquiryId));
  const [listing] = inq?.productId
    ? await db
        .select({ id: productListings.id })
        .from(productListings)
        .where(and(eq(productListings.productId, inq.productId), eq(productListings.companyId, companyId)))
        .limit(1)
    : [];
  const r = await db
    .insert(inquirySuppliers)
    .values({ inquiryId, companyId, listingId: listing?.id ?? null, createdBy: by.id })
    .onConflictDoNothing()
    .returning({ id: inquirySuppliers.id });
  return r.length ? "added" : "exists";
}

// تغییر وضعیت یک کارخانه در درخواست: رویداد تازه + ردیف سابقه‌ی مکاتبه + وضعیت فعلی
export async function setSupplierStatus(supplierId: string, status: SupplierStatus, note: string | null, by: Who) {
  return db.transaction(async (tx) => {
    const [s] = await tx
      .select({ s: inquirySuppliers, productId: inquiries.productId, inquiryId: inquiries.id })
      .from(inquirySuppliers)
      .innerJoin(inquiries, eq(inquiries.id, inquirySuppliers.inquiryId))
      .where(eq(inquirySuppliers.id, supplierId))
      .for("update");
    if (!s) return null;
    const [corr] = await tx
      .insert(companyCorrespondence)
      .values({
        companyId: s.s.companyId,
        productId: s.productId,
        listingId: s.s.listingId,
        kind: "note",
        channel: "other",
        direction: DIRECTION[status],
        body: `پیگیری درخواست مشتری #${shortId(s.inquiryId)}: ${SUPPLIER_STATUS_FA[status]}${note ? `\n${note}` : ""}`,
        createdBy: by.id,
      })
      .returning({ id: companyCorrespondence.id });
    await tx.insert(inquirySupplierEvents).values({ inquirySupplierId: supplierId, status, note, correspondenceId: corr.id, createdBy: by.id });
    await tx.update(inquirySuppliers).set({ status, lastNote: note }).where(eq(inquirySuppliers.id, supplierId));
    await tx.update(inquiries).set({ updatedAt: new Date() }).where(eq(inquiries.id, s.inquiryId));
    return { before: s.s.status, inquiryId: s.inquiryId, companyId: s.s.companyId, correspondenceId: corr.id };
  });
}

// تعداد کارخانه‌ها در هر وضعیت برای فهرست درخواست‌ها
export const supplierSummaryExpr = sql<Record<string, number> | null>`(select jsonb_object_agg(status, n) from
  (select status, count(*)::int as n from inquiry_suppliers s where s.inquiry_id = ${inquiries.id} group by status) x)`;
