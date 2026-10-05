import "server-only";
// فهرست گفتگوهای یک مشتری برای «گفتگوهای من»: محصول یا موضوع، آخرین پیام قابل‌دیدن، وضعیت و تعداد خوانده‌نشده.
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations, products } from "@/db/schema";
import { customerUnreadExpr } from "./service";

export type CustomerConvRow = {
  id: string;
  kind: "product" | "general";
  title: string;
  productSlug: string | null;
  status: "open" | "closed";
  lastMessageAt: Date;
  preview: string | null;
  unread: number;
};

export async function customerConversations(customerId: string): Promise<CustomerConvRow[]> {
  const rows = await db
    .select({
      id: conversations.id,
      kind: conversations.kind,
      subject: conversations.subject,
      productTitle: products.titleFa,
      productSlug: products.slug,
      productStatus: products.status,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      preview: sql<string | null>`(select m.body from chat_messages m where m.conversation_id = ${conversations.id} and m.visible_to_customer
        order by m.id desc limit 1)`,
      unread: customerUnreadExpr(customerId),
    })
    .from(conversations)
    .leftJoin(products, eq(products.id, conversations.productId))
    .where(eq(conversations.customerId, customerId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.kind === "general" ? (r.subject ?? "گفتگوی عمومی") : (r.productTitle ?? "محصولی که دیگر نمایش داده نمی‌شود"),
    // لینک صفحه‌ی محصول فقط اگر هنوز منتشرشده است
    productSlug: r.productStatus === "published" ? r.productSlug : null,
    status: r.status,
    lastMessageAt: r.lastMessageAt,
    preview: r.preview,
    unread: r.unread,
  }));
}
