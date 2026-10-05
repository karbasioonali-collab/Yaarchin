import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatThread } from "@/components/site/ChatThread";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { toCustomerMsg } from "@/lib/chat/dto";
import { getConversation, markRead, messagesOf } from "@/lib/chat/service";
import { requireCustomer } from "@/lib/customer/auth";
import { chatReady } from "@/lib/db-ready";
import { isEnabled } from "@/lib/settings";
import { eq } from "drizzle-orm";
import styles from "../../account.module.css";
import { AccountShell } from "../../AccountShell";

export const metadata: Metadata = { title: "گفتگو", robots: { index: false } };

// یک گفتگوی مشتری: سابقه‌ی کامل و ادامه‌ی گفتگو. گفتگوی مشتری دیگر = «پیدا نشد».
export default async function MyChatPage({ params }: PageProps<"/account/chats/[id]">) {
  const { id } = await params;
  const a = await requireCustomer(`/account/chats/${id}`);
  if (!(await isEnabled("chat")) || !(await chatReady())) notFound();
  const conv = await getConversation(id);
  if (!conv || conv.customerId !== a.user.id) notFound();
  const [product] = conv.productId
    ? await db.select({ titleFa: products.titleFa, slug: products.slug, status: products.status }).from(products).where(eq(products.id, conv.productId))
    : [];
  const msgs = await messagesOf(conv.id, { forCustomer: true });
  await markRead(conv.id, a.user.id, msgs.at(-1)?.id ?? 0);
  const title = conv.kind === "general" ? (conv.subject ?? "گفتگوی عمومی") : (product?.titleFa ?? "گفتگو درباره‌ی محصول");

  return (
    <AccountShell title="گفتگوهای من" name={a.user.fullName}>
      <div className={styles.threadBox}>
        <div className={styles.threadHead}>
          <div className={styles.chatTitle}>
            {title}
            {conv.kind === "general" && <span className={styles.chip}>عمومی</span>}
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
            {product?.status === "published" && <Link href={`/p/${product.slug}`}>صفحه‌ی محصول</Link>}
            <Link href="/account/chats">همه‌ی گفتگوها</Link>
          </div>
        </div>
        <ChatThread conversationId={conv.id} initial={msgs.map(toCustomerMsg)} initialStatus={conv.status} tall />
      </div>
    </AccountShell>
  );
}
