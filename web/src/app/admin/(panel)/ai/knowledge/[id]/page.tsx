import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { kbItems, users } from "@/db/schema";
import { reviewDays, versionsOf } from "@/lib/ai/kb";
import { requirePermission } from "@/lib/auth/can";
import { aiReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import styles from "../../../panel.module.css";
import { reviewKbAction, saveKbAction } from "../../actions";
import { KbFields } from "../KbFields";

export const metadata: Metadata = { title: "مورد پایگاه دانش" };

export default async function KbItemPage({ params }: PageProps<"/admin/ai/knowledge/[id]">) {
  await requirePermission("ai.knowledge");
  const { id } = await params;
  if (!(await aiReady()) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [item] = await db.select().from(kbItems).where(eq(kbItems.id, id));
  if (!item) notFound();
  const [versions, days, names] = await Promise.all([versionsOf(id), reviewDays(), db.select({ id: users.id, n: users.fullName }).from(users)]);
  const name = (u: string | null) => (u ? (names.find((x) => x.id === u)?.n ?? "—") : "—");
  const overdue = new Date().getTime() - item.lastReviewedAt.getTime() > days * 86_400_000;
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{item.question}</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/ai/knowledge">پایگاه دانش</Link> · آخرین بررسی {fmtDateTime(item.lastReviewedAt)} ({name(item.lastReviewedBy)}) · آخرین ویرایش{" "}
            {fmtDateTime(item.updatedAt)}
            {overdue && (
              <>
                {" "}
                <span className={`${styles.badge} ${styles.badgeWarn}`}>نیاز به بررسی مجدد</span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>ویرایش</h2>
          <ActionForm action={saveKbAction} submitLabel="ذخیره">
            <KbFields item={item} />
          </ActionForm>
          <form action={reviewKbAction} style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={item.id} />
            <button type="submit" className={styles.btnGhost}>
              بررسی شد، درست است (بدون تغییر متن)
            </button>
          </form>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>تاریخچه‌ی تغییرات ({fmtNum(versions.length)})</h2>
          {versions.map((v) => (
            <div key={v.id} className={styles.batch}>
              <div className={styles.muted} style={{ fontSize: 12 }}>
                {fmtDateTime(v.createdAt)} · {name(v.changedBy)} · {v.status === "active" ? "فعال" : "پیش‌نویس"}
              </div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{v.question}</div>
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{v.answer}</div>
            </div>
          ))}
          {!versions.length && <p className={styles.muted}>هنوز تغییری ثبت نشده (پیش‌نویس اولیه از seed).</p>}
        </div>
      </div>
    </>
  );
}
