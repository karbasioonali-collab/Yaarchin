import type { Metadata } from "next";
import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { db } from "@/db/client";
import { aiRequests } from "@/db/schema";
import { aiConfig } from "@/lib/ai/config";
import { blacklistTerms } from "@/lib/ai/guard-terms";
import { reviewDays } from "@/lib/ai/kb";
import { PROMPT_VERSION } from "@/lib/ai/prompt";
import { HANDOFF_FA } from "@/lib/ai/rules";
import { aiStatus } from "@/lib/ai/state";
import { aiLimits, todayUsage } from "@/lib/ai/usage";
import { requirePermission } from "@/lib/auth/can";
import { aiReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { getSetting, isEnabled } from "@/lib/settings";
import styles from "../panel.module.css";
import { saveAiLimitsAction, saveBlacklistAction } from "./actions";
import { ConnectionTest } from "./ConnectionTest";

export const metadata: Metadata = { title: "دستیار هوشمند" };

const PURPOSE_FA: Record<string, string> = { chat: "چت", connection_test: "تست اتصال", test_run: "آزمون", extract: "استخراج", suggest: "پیشنهاد" };
const STATUS_FA: Record<string, string> = {
  ok: "جواب داد",
  handoff: "ارجاع",
  guard_block: "محافظ جلوگیری کرد",
  error: "خطا",
  timeout: "دیر شد",
  parse_error: "جواب نامفهوم",
  skipped: "رد شد",
};
const SOURCE_FA: Record<string, string> = { product: "محصول", calculator: "ماشین‌حساب", knowledge: "پایگاه دانش", general: "عمومی" };

// وضعیت، تست اتصال، سقف‌ها، لیست سیاه و لاگ درخواست‌های دستیار هوشمند (ai.settings). docs/infoyaarchin.md بخش ۲۹.
export default async function AiPage() {
  await requirePermission("ai.settings");
  const ready = await aiReady();
  const cfg = aiConfig();
  const [status, switchOn, limits, usage, terms, manual, days] = await Promise.all([
    aiStatus(),
    isEnabled("ai_agent"),
    aiLimits(),
    ready ? todayUsage() : Promise.resolve({ requests: 0, costToman: 0, promptTokens: 0, completionTokens: 0 }),
    ready ? blacklistTerms() : Promise.resolve([]),
    getSetting<string[]>("ai.blacklist").then((x) => x ?? []),
    reviewDays(),
  ]);
  const [recent, ext] = await Promise.all([
    ready ? db.select().from(aiRequests).orderBy(desc(aiRequests.id)).limit(50) : Promise.resolve([]),
    db
      .execute<{ name: string; installed: string | null; available: string | null }>(
        sql`select a.name, e.extversion as installed, a.default_version as available from pg_available_extensions a left join pg_extension e on e.extname = a.name where a.name in ('vector', 'pg_trgm')`,
      )
      .then((r) => r.rows)
      .catch(() => []),
  ]);
  const costPct = limits.dailyCostToman ? Math.round((usage.costToman / limits.dailyCostToman) * 100) : 0;
  const ext1 = (n: string) => ext.find((x) => x.name === n);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>دستیار هوشمند یارچین</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/ai/knowledge">پایگاه دانش</Link> · سوئیچ در <Link href="/admin/settings">تنظیمات و سوئیچ‌ها</Link> · دستورالعمل نسخه‌ی {PROMPT_VERSION}
          </p>
        </div>
      </div>
      {!ready && <div className={styles.impersonation}>بخش دستیار بعد از اجرای migration ۰۰۱۰ فعال می‌شود (در کنسول لیارا npm run db:migrate و بعد npm run db:seed).</div>}

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>وضعیت</h2>
          <p style={{ margin: "0 0 6px" }}>
            سوئیچ: {switchOn ? <span className={styles.badge}>روشن</span> : <span className={`${styles.badge} ${styles.badgeMuted}`}>خاموش</span>} · حالت:{" "}
            {status === "live" ? (
              <span className={styles.badge}>زنده — جواب به مشتری‌ها</span>
            ) : cfg.mode === "test" ? (
              <span className={`${styles.badge} ${styles.badgeWarn}`}>آزمایشی (کلید لیارا تعریف نشده؛ جواب‌ها فقط در پنل)</span>
            ) : (
              <span className={`${styles.badge} ${styles.badgeMuted}`}>کلید هست، سوئیچ خاموش</span>
            )}
          </p>
          <p className={styles.muted} style={{ fontSize: 13, margin: 0 }}>
            مدل اصلی: <span className={styles.ltr}>{cfg.model}</span> · پشتیبان: <span className={styles.ltr}>{cfg.fallbackModel ?? "—"}</span> (از متغیرهای AI_MODEL و
            AI_FALLBACK_MODEL لیارا)
          </p>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>مصرف امروز (روز تهران)</h2>
          <p style={{ margin: "0 0 6px" }}>
            {fmtNum(usage.requests)} درخواست از سقف {fmtNum(limits.dailyRequests)} · {fmtNum(Math.round(usage.costToman))} تومان از سقف {fmtNum(limits.dailyCostToman)} (
            {fmtNum(costPct)}٪)
          </p>
          {costPct >= 80 && <p className={styles.notice}>⚠ بیش از ۸۰٪ سقف هزینه‌ی امروز مصرف شده؛ با رسیدن به سقف، دستیار تا فردا جواب نمی‌دهد و چت‌ها به کارشناس می‌روند.</p>}
          <p className={styles.muted} style={{ fontSize: 13, margin: 0 }}>
            توکن ورودی {fmtNum(usage.promptTokens)} · خروجی {fmtNum(usage.completionTokens)}. هزینه همان «total_cost_toman» لیارا است.
          </p>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <h2 className={styles.cardTitle}>تست اتصال</h2>
        <p className={styles.muted} style={{ marginTop: 0, fontSize: 13 }}>
          مدل اصلی، Tool ماشین‌حساب از طریق لیارا و مدل پشتیبان را می‌آزماید. وقتی سوئیچ دستیار خاموش است هم کار می‌کند و هیچ مشتری‌ای درگیر نمی‌شود. چند ده تومان هزینه دارد.
        </p>
        <ConnectionTest enabled={ready && cfg.mode === "live"} />
        {cfg.mode !== "live" && <p className={styles.muted}>اول AI_BASE_URL و AI_API_KEY را در متغیرهای برنامه در لیارا تعریف کنید.</p>}
      </div>

      <div className={styles.grid} style={{ marginTop: 16 }}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>سقف‌ها</h2>
          <ActionForm action={saveAiLimitsAction} submitLabel="ذخیره">
            <div className={styles.row}>
              <Field label="سقف جواب دستیار در هر گفتگو" name="maxReplies" defaultValue={String(limits.maxRepliesPerChat)} inputMode="numeric" ltr />
              <Field label="سقف پیام هر مشتری در ۲۴ ساعت" name="customerDaily" defaultValue={String(limits.customerDailyMessages)} inputMode="numeric" ltr />
            </div>
            <div className={styles.row}>
              <Field label="سقف درخواست روزانه‌ی کل" name="dailyRequests" defaultValue={String(limits.dailyRequests)} inputMode="numeric" ltr />
              <Field label="سقف هزینه‌ی روزانه‌ی کل (تومان)" name="dailyCost" defaultValue={String(limits.dailyCostToman)} inputMode="numeric" ltr hint="هشدار در ۸۰٪" />
            </div>
            <div className={styles.row}>
              <Field label="آستانه‌ی سفارش بزرگ (تعداد)" name="bigOrder" defaultValue={String(limits.bigOrderQty)} inputMode="numeric" ltr />
              <Field label="آستانه‌ی امتیاز جدیت برای ارجاع" name="leadScore" defaultValue={String(limits.leadScoreHandoff)} inputMode="numeric" ltr />
            </div>
            <div className={styles.row}>
              <Field label="برگشت دستیار به گفتگوی بازشده بعد از (ساعت)" name="resumeHours" defaultValue={String(limits.resumeAfterHours)} inputMode="numeric" ltr />
              <Field label="بازه‌ی بررسی مجدد پایگاه دانش (روز)" name="reviewDays" defaultValue={String(days)} inputMode="numeric" ltr />
            </div>
          </ActionForm>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>لیست سیاه محافظ خروجی</h2>
          <p className={styles.muted} style={{ marginTop: 0, fontSize: 13 }}>
            اگر جواب دستیار یکی از این‌ها را داشته باشد، نمایش داده نمی‌شود و گفتگو با برچسب «احتمال افشای اطلاعات» به کارشناس می‌رود. لینک، ایمیل، تلفن، سایت‌های خرید و الگوهای
            نام شرکت (Co., Ltd و …) همیشه بررسی می‌شوند. به‌علاوه {fmtNum(Math.max(0, terms.length - manual.length))} مورد خودکار از اسم کارخانه‌ها و تماس‌هایشان.
          </p>
          <ActionForm action={saveBlacklistAction} submitLabel="ذخیره">
            <label className={ui.field}>
              <span className={ui.label}>هر خط یک کلمه یا عبارت</span>
              <textarea name="terms" className={`${ui.textarea} ${ui.ltr}`} rows={6} defaultValue={manual.join("\n")} />
            </label>
          </ActionForm>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <h2 className={styles.cardTitle}>افزونه‌های دیتابیس</h2>
        <p style={{ margin: 0, fontSize: 14 }}>
          pgvector (جستجوی معنایی):{" "}
          {ext1("vector")?.installed
            ? `نصب است (نسخه‌ی ${ext1("vector")!.installed})`
            : ext1("vector")
              ? `در دسترس ولی نصب نشده (CREATE EXTENSION لازم است)`
              : "روی این دیتابیس در دسترس نیست"}{" "}
          · pg_trgm: {ext1("pg_trgm")?.installed ? `نصب است (${ext1("pg_trgm")!.installed})` : ext1("pg_trgm") ? "در دسترس، نصب نشده" : "در دسترس نیست"}
        </p>
        <p className={styles.muted} style={{ fontSize: 12, margin: "4px 0 0" }}>
          فقط خواندن (pg_extension و pg_available_extensions)؛ چیزی نصب یا عوض نمی‌شود. پایگاه دانش فعلاً جستجوی متنی دارد.
        </p>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <h2 className={styles.cardTitle}>آخرین درخواست‌ها</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>زمان</th>
                <th>نوع</th>
                <th>نتیجه</th>
                <th>مدل</th>
                <th>توکن</th>
                <th>هزینه</th>
                <th>زمان پاسخ</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                    {fmtDateTime(r.createdAt)}
                    {r.conversationId && (
                      <div>
                        <Link href={`/admin/chats/${r.conversationId}`} style={{ fontSize: 12 }}>
                          گفتگو
                        </Link>
                      </div>
                    )}
                  </td>
                  <td>
                    {PURPOSE_FA[r.purpose] ?? r.purpose}
                    {r.mode === "test" && <span className={`${styles.badge} ${styles.badgeWarn}`}>آزمایشی</span>}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {STATUS_FA[r.status] ?? r.status}
                    {r.outcome && <div className={styles.muted}>{SOURCE_FA[r.outcome] ?? HANDOFF_FA[r.outcome] ?? r.outcome}</div>}
                    {r.error && <div style={{ color: "#B3261E", fontSize: 12 }}>{r.error}</div>}
                  </td>
                  <td className={styles.ltr} style={{ fontSize: 12 }}>
                    {r.model ?? "—"}
                    {r.fallbackUsed ? " (پشتیبان)" : ""}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {fmtNum(r.promptTokens)} / {fmtNum(r.completionTokens)}
                  </td>
                  <td>{fmtNum(Math.round(Number(r.costToman)))}</td>
                  <td>{r.latencyMs !== null ? `${fmtNum(Math.round(r.latencyMs / 100) / 10)} ث` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!recent.length && <p className={styles.muted}>هنوز درخواستی ثبت نشده.</p>}
      </div>
    </>
  );
}
