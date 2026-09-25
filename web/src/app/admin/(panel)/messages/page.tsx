import type { Metadata } from "next";
import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { contactMessages, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth/can";
import { catalogReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import styles from "../panel.module.css";
import { setMessageStatusAction } from "./actions";

export const metadata: Metadata = { title: "پیام‌های تماس" };

const TABS = [
  { key: "new", label: "جدید" },
  { key: "read", label: "خوانده‌شده" },
  { key: "archived", label: "بایگانی" },
] as const;
const PAGE = 30;

export default async function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  await requirePermission("contact.view");
  if (!(await catalogReady())) {
    return <div className={styles.impersonation}>جدول پیام‌ها هنوز ساخته نشده است. در کنسول لیارا npm run db:migrate را اجرا کنید.</div>;
  }
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.status)?.key ?? "new";
  const page = Math.max(1, Number(sp.page) || 1);

  const counts = await db.select({ status: contactMessages.status, n: count() }).from(contactMessages).groupBy(contactMessages.status);
  const countOf = (k: string) => counts.find((c) => c.status === k)?.n ?? 0;
  const rows = await db
    .select({ m: contactMessages, handler: users.fullName })
    .from(contactMessages)
    .leftJoin(users, eq(users.id, contactMessages.handledBy))
    .where(eq(contactMessages.status, tab))
    .orderBy(desc(contactMessages.createdAt))
    .limit(PAGE + 1)
    .offset((page - 1) * PAGE);
  const hasNext = rows.length > PAGE;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>پیام‌های تماس با ما</h1>
          <p className={styles.pageSub}>پیام‌هایی که از فرم «تماس با ما» رسیده‌اند.</p>
        </div>
      </div>
      <div className={styles.toolbar}>
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/messages?status=${t.key}`} className={t.key === tab ? styles.btn : styles.btnGhost}>
            {t.label} ({fmtNum(countOf(t.key))})
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.muted} style={{ margin: 0 }}>
            پیامی در این بخش نیست.
          </p>
        </div>
      ) : (
        rows.slice(0, PAGE).map(({ m, handler }) => (
          <div key={m.id} className={styles.card}>
            <div className={styles.row} style={{ alignItems: "flex-start" }}>
              <div style={{ flex: "3 1 280px" }}>
                <div className={styles.cardTitle} style={{ marginBottom: 4 }}>
                  {m.subject}
                </div>
                <div className={styles.muted} style={{ fontSize: 13 }}>
                  {m.name} ·{" "}
                  {m.mobile && (
                    <a href={`tel:${m.mobile}`} className={styles.ltr}>
                      {m.mobile}
                    </a>
                  )}
                  {m.email && (
                    <a href={`mailto:${m.email}`} className={styles.ltr}>
                      {m.email}
                    </a>
                  )}{" "}
                  · {fmtDateTime(m.createdAt)}
                  {m.userId && <span className={styles.badge}>کاربر واردشده</span>}
                </div>
                <p style={{ whiteSpace: "pre-line", margin: "10px 0 0" }}>{m.message}</p>
                {m.handledAt && (
                  <div className={styles.muted} style={{ fontSize: 12, marginTop: 8 }}>
                    آخرین تغییر وضعیت: {handler ?? "—"} · {fmtDateTime(m.handledAt)}
                  </div>
                )}
              </div>
              <div style={{ flex: "1 1 160px", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {TABS.filter((t) => t.key !== m.status).map((t) => (
                  <ActionForm key={t.key} action={setMessageStatusAction} submitLabel={t.key === "new" ? "علامت جدید" : t.key === "read" ? "خوانده شد" : "بایگانی"} submitVariant="secondary" className={styles.inlineForm}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="status" value={t.key} />
                  </ActionForm>
                ))}
              </div>
            </div>
          </div>
        ))
      )}
      <div className={styles.pager}>
        {page > 1 && (
          <Link href={`/admin/messages?status=${tab}&page=${page - 1}`} className={styles.btnGhost}>
            قبلی
          </Link>
        )}
        {hasNext && (
          <Link href={`/admin/messages?status=${tab}&page=${page + 1}`} className={styles.btnGhost}>
            بعدی
          </Link>
        )}
      </div>
    </>
  );
}
