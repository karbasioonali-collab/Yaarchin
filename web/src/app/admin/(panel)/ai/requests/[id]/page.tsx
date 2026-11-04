import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiRequests } from "@/db/schema";
import { callLine, readRequestMeta } from "@/lib/ai/request-meta";
import { HANDOFF_FA } from "@/lib/ai/rules";
import { requirePermission } from "@/lib/auth/can";
import { aiReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import styles from "../../../panel.module.css";

export const metadata: Metadata = { title: "خروجی خام دستیار" };

// خروجی خام یک درخواست دستیار (بخش ۴۵): هر تلاش با زمان و توکن، متن خام مدل، تکه‌های حذف‌شده از متن مشتری.
// فقط مدیر؛ صفحه‌ی ساده بدون جاوااسکریپت تا روی هر مرورگری باز شود.
export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const a = await requirePermission("ai.settings");
  if (!a.user.isAdmin || !(await aiReady())) notFound();
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) notFound();
  const [r] = await db
    .select()
    .from(aiRequests)
    .where(eq(aiRequests.id, Number(id)));
  if (!r) notFound();
  const m = readRequestMeta(r.meta);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>خروجی خام دستیار</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/ai">دستیار هوشمند</Link> · {fmtDateTime(r.createdAt)} · <span className={styles.ltr}>{r.model ?? "—"}</span>
          </p>
        </div>
      </div>
      <div className={styles.card} data-testid="request-raw">
        <p>
          نتیجه: {r.status}
          {r.outcome && ` · ${HANDOFF_FA[r.outcome] ?? r.outcome}`} · کل زمان {r.latencyMs !== null ? `${fmtNum(Math.round(r.latencyMs / 100) / 10)} ث` : "—"} ·{" "}
          {fmtNum(r.promptTokens)} → {fmtNum(r.completionTokens)} توکن
        </p>
        {r.error && <p style={{ color: "#B3261E" }}>{r.error}</p>}
        <h2 className={styles.cardTitle}>تلاش‌ها</h2>
        {m.calls.length ? (
          <ol data-testid="request-calls">
            {m.calls.map((c, i) => (
              <li key={i}>{callLine(c)}</li>
            ))}
          </ol>
        ) : (
          <p className={styles.muted}>زمان هر تلاش فقط برای درخواست‌های بعد از این نسخه ثبت می‌شود.</p>
        )}
        <h2 className={styles.cardTitle}>متن خام مدل</h2>
        {m.raws.length ? (
          m.raws.map((x, i) => (
            <pre key={i} dir="auto" style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "rgba(34,34,34,.04)", padding: 8, borderRadius: 8 }}>
              {x || "(خالی)"}
            </pre>
          ))
        ) : (
          <p className={styles.muted}>برای این درخواست متن خام ذخیره نشده است.</p>
        )}
        {m.blocked && (
          <>
            <h2 className={styles.cardTitle}>جوابی که محافظ رد کرد</h2>
            <pre dir="auto" style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
              {m.blocked}
            </pre>
          </>
        )}
        {m.handoffNote && <p>یادداشت ارجاع: {m.handoffNote}</p>}
        {m.cleaned.length > 0 && <p className={styles.muted}>از متن مشتری حذف شد: {m.cleaned.join(" · ")}</p>}
      </div>
    </>
  );
}
