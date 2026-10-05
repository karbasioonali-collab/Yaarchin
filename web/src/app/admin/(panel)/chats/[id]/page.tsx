import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import ui from "@/components/ui/ui.module.css";
import { db } from "@/db/client";
import { categories, conversationFlags, products, users } from "@/db/schema";
import { can, requireAnyPermission } from "@/lib/auth/can";
import { CHAT_PERMS, canChangeStatus, canReply, canSee, chatAccess } from "@/lib/chat/access";
import { toStaffMsg } from "@/lib/chat/dto";
import { assignableStaff, getConversation, markRead, messagesOf } from "@/lib/chat/service";
import { chatReady } from "@/lib/db-ready";
import { fmtDateTime } from "@/lib/format";
import styles from "../../panel.module.css";
import c from "../chats.module.css";
import { assignAction, statusAction } from "../actions";
import { StaffThread } from "./StaffThread";

export const metadata: Metadata = { title: "گفتگو" };

export default async function ChatPage({ params }: PageProps<"/admin/chats/[id]">) {
  const a = await requireAnyPermission(CHAT_PERMS);
  if (!(await chatReady())) notFound();
  const access = await chatAccess(a.user);
  const conv = await getConversation((await params).id);
  if (!conv || !canSee(access, conv)) notFound();

  const [[customer], [product], [expert], msgs, staff, flags, seeCustomers] = await Promise.all([
    db.select({ id: users.id, fullName: users.fullName, mobile: users.mobile, email: users.email, status: users.status }).from(users).where(eq(users.id, conv.customerId)),
    conv.productId
      ? db
          .select({ id: products.id, titleFa: products.titleFa, slug: products.slug, status: products.status, category: categories.nameFa })
          .from(products)
          .leftJoin(categories, eq(categories.id, products.categoryId))
          .where(eq(products.id, conv.productId))
      : Promise.resolve([]),
    conv.assignedTo ? db.select({ fullName: users.fullName }).from(users).where(eq(users.id, conv.assignedTo)) : Promise.resolve([]),
    messagesOf(conv.id, { forCustomer: false }),
    access.assign ? assignableStaff() : Promise.resolve([]),
    db
      .select()
      .from(conversationFlags)
      .where(and(eq(conversationFlags.conversationId, conv.id), isNull(conversationFlags.resolvedAt)))
      .orderBy(desc(conversationFlags.createdAt)),
    can(a.user, "customers.view"),
  ]);
  await markRead(conv.id, a.user.id, msgs.at(-1)?.id ?? 0);
  const reply = canReply(access, conv);
  const replyHint = reply
    ? null
    : conv.status === "closed"
      ? "گفتگو بسته است. برای پاسخ، اول «بازکردن» را بزنید."
      : conv.assignedTo === a.user.id
        ? "دسترسی پاسخ به گفتگو (chats.reply) ندارید."
        : access.assign
          ? "فقط کارشناس ارجاع‌گرفته پاسخ می‌دهد. برای پاسخ، اول «ارجاع به خودم» را بزنید."
          : "فقط کارشناس ارجاع‌گرفته پاسخ می‌دهد؛ شما فقط می‌بینید.";
  const title = conv.kind === "general" ? (conv.subject ?? "گفتگوی عمومی") : (product?.titleFa ?? "محصول حذف‌شده");

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>
            {conv.kind === "general" && <span className={`${styles.badge} ${styles.badgeWarn}`}>عمومی</span>} {title}
          </h1>
          <p className={styles.pageSub}>
            <Link href="/admin/chats">گفتگوها</Link> · {customer?.fullName} · {conv.status === "open" ? "باز" : "بسته"} · شروع {fmtDateTime(conv.createdAt)}
          </p>
        </div>
      </div>

      <div className={c.layout}>
        <StaffThread
          key={`${conv.status}-${conv.assignedTo}`}
          conversationId={conv.id}
          initial={msgs.map(toStaffMsg)}
          canReply={reply}
          replyHint={replyHint}
          status={conv.status}
          assignedTo={conv.assignedTo}
        />

        <div className={c.side}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>مشتری</h2>
            <div>{seeCustomers ? <Link href={`/admin/customers/${customer.id}`}>{customer.fullName}</Link> : customer.fullName}</div>
            {customer.mobile && <div className={`${styles.ltr} ${styles.muted}`}>{customer.mobile}</div>}
            {customer.email && <div className={`${styles.ltr} ${styles.muted}`}>{customer.email}</div>}
            {customer.status !== "active" && <span className={`${styles.badge} ${styles.badgeWarn}`}>حساب غیرفعال</span>}
            {product && (
              <>
                <h3 className={styles.groupTitle}>محصول</h3>
                <div>
                  <Link href={`/admin/products/${product.id}`}>{product.titleFa}</Link>
                  {product.category && (
                    <div className={styles.muted} style={{ fontSize: 12 }}>
                      {product.category}
                    </div>
                  )}
                  {product.status === "published" && (
                    <div style={{ fontSize: 13 }}>
                      <a href={`/p/${product.slug}`} target="_blank" rel="noreferrer">
                        صفحه‌ی سایت ↗
                      </a>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>کارشناس</h2>
            <p style={{ marginTop: 0 }}>{expert ? expert.fullName : <span className={`${styles.badge} ${styles.badgeWarn}`}>ارجاع‌نشده</span>}</p>
            {access.assign && (
              <>
                {conv.assignedTo !== a.user.id && (
                  <ActionForm action={assignAction} submitLabel="ارجاع به خودم" submitVariant="secondary">
                    <input type="hidden" name="id" value={conv.id} />
                    <input type="hidden" name="to" value="me" />
                  </ActionForm>
                )}
                <ActionForm action={assignAction} submitLabel="ارجاع">
                  <input type="hidden" name="id" value={conv.id} />
                  <label className={ui.field}>
                    <span className={ui.label}>ارجاع / جابه‌جایی به</span>
                    <select name="to" defaultValue={conv.assignedTo ?? ""} className={ui.select}>
                      <option value="">— ارجاع‌نشده (برگشت به صف) —</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                </ActionForm>
              </>
            )}
            {canChangeStatus(access, conv) && (
              <div style={{ marginTop: 12 }}>
                <ActionForm
                  action={statusAction}
                  submitLabel={conv.status === "open" ? "بستن گفتگو" : "بازکردن گفتگو"}
                  submitVariant={conv.status === "open" ? "danger" : "secondary"}
                  confirm={conv.status === "open" ? "گفتگو بسته شود؟ مشتری با پیام تازه می‌تواند دوباره بازش کند." : undefined}
                >
                  <input type="hidden" name="id" value={conv.id} />
                  <input type="hidden" name="status" value={conv.status === "open" ? "closed" : "open"} />
                </ActionForm>
              </div>
            )}
          </div>

          {flags.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>برچسب‌ها</h2>
              {flags.map((fl) => (
                <div key={fl.id} className={styles.batch}>
                  <span className={`${styles.badge} ${styles.badgeWarn}`}>{fl.flag === "needs_expert" ? "نیاز به کارشناس" : "نیاز به بررسی"}</span>
                  {fl.reason && <div style={{ fontSize: 13 }}>{fl.reason}</div>}
                  <div className={styles.muted} style={{ fontSize: 12 }}>
                    {fmtDateTime(fl.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
