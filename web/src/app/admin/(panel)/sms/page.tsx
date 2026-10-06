import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { smsOutbox, users } from "@/db/schema";
import { requireAnyPermission } from "@/lib/auth/can";
import { followupReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { smsProviderName } from "@/lib/sms";
import styles from "../panel.module.css";

export const metadata: Metadata = { title: "پیامک‌های ارسالی" };
const PAGE = 50;
const SMS_KIND_FA: Record<string, string> = { chat_new: "گفتگوی تازه", chat_assigned: "ارجاع به کارشناس", chat_reminder: "یادآوری پیام بی‌پاسخ", otp: "کد ورود" };
const STATUS_FA: Record<string, string> = { test: "آزمایشی (فرستاده نشد)", sent: "فرستاده شد", failed: "خطا", skipped: "فرستاده نشد طبق قاعده" };

// همه‌ی پیامک‌ها (sms_outbox): در حالت آزمایشی (بدون SMS_PROVIDER) پیامک‌هایی که «قرار بود» فرستاده شوند فقط اینجا دیده می‌شوند.
export default async function SmsPage({ searchParams }: PageProps<"/admin/sms">) {
  await requireAnyPermission(["settings.manage", "chats.assign"]);
  if (!(await followupReady())) {
    return <div className={styles.impersonation}>جدول پیامک‌ها (migration ۰۰۰۷) هنوز ساخته نشده است. در کنسول لیارا npm run db:migrate را اجرا کنید.</div>;
  }
  const sp = await searchParams;
  const kind = typeof sp.kind === "string" && sp.kind in SMS_KIND_FA ? sp.kind : "";
  const status = typeof sp.status === "string" && sp.status in STATUS_FA ? sp.status : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const conds: SQL[] = [];
  if (kind) conds.push(eq(smsOutbox.kind, kind));
  if (status) conds.push(eq(smsOutbox.status, status as "test"));
  const where = conds.length ? and(...conds) : undefined;
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(smsOutbox).where(where),
    db
      .select({ s: smsOutbox, name: users.fullName })
      .from(smsOutbox)
      .leftJoin(users, eq(users.id, smsOutbox.userId))
      .where(where)
      .orderBy(desc(smsOutbox.id))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
  ]);
  const provider = smsProviderName();
  const qs = (p: number) => `?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(status ? { status } : {}), page: String(p) })}`;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>پیامک‌های ارسالی</h1>
          <p className={styles.pageSub}>
            {provider ? (
              <>
                سرویس پیامک: <span className={styles.mono}>{provider}</span>
              </>
            ) : (
              <>
                <span className={`${styles.badge} ${styles.badgeWarn}`}>حالت آزمایشی</span> سرویس پیامک وصل نیست؛ هیچ پیامکی واقعاً فرستاده نمی‌شود و فقط اینجا ثبت می‌شود. با تنظیم
                SMS_PROVIDER و کلیدش در متغیرهای لیارا، بدون تغییر کد واقعی می‌شود.
              </>
            )}{" "}
            <Link href="/admin/chats/settings">قاعده‌های پیامک</Link>
          </p>
        </div>
      </div>
      <div className={styles.card}>
        <form method="get" className={styles.toolbar}>
          <select name="kind" defaultValue={kind} aria-label="نوع">
            <option value="">همه‌ی انواع</option>
            {Object.entries(SMS_KIND_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status} aria-label="وضعیت">
            <option value="">همه‌ی وضعیت‌ها</option>
            {Object.entries(STATUS_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button type="submit" className={styles.btnGhost}>
            فیلتر
          </button>
        </form>
        <p className={styles.muted} style={{ fontSize: 13, marginTop: 0 }}>
          {fmtNum(total)} پیامک
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>زمان</th>
                <th>گیرنده</th>
                <th>نوع</th>
                <th>متن</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, name }) => (
                <tr key={s.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{fmtDateTime(s.createdAt)}</td>
                  <td>
                    {name ?? "—"}
                    <div className={`${styles.ltr} ${styles.muted}`} style={{ fontSize: 12 }}>
                      {s.toMobile}
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {SMS_KIND_FA[s.kind] ?? s.kind}
                    {s.conversationId && (
                      <div>
                        <Link href={`/admin/chats/${s.conversationId}`} style={{ fontSize: 12 }}>
                          گفتگو
                        </Link>
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 13, whiteSpace: "pre-wrap", maxWidth: 420 }}>{s.body}</td>
                  <td style={{ fontSize: 13 }}>
                    <span className={`${styles.badge} ${s.status === "sent" ? "" : s.status === "test" ? styles.badgeWarn : styles.badgeMuted}`}>{STATUS_FA[s.status]}</span>
                    {s.error && <div className={styles.muted}>{s.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className={styles.muted}>هنوز پیامکی ثبت نشده.</p>}
        {total > PAGE && (
          <div className={styles.pager}>
            {page > 1 && <Link href={qs(page - 1)}>← قبلی</Link>}
            <span className={styles.muted}>
              صفحه‌ی {fmtNum(page)} از {fmtNum(Math.ceil(total / PAGE))}
            </span>
            {page * PAGE < total && <Link href={qs(page + 1)}>بعدی →</Link>}
          </div>
        )}
      </div>
    </>
  );
}
