import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ui/ActionForm";
import { Checkbox, Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { LEAD_RULE_KINDS } from "@/db/schema";
import { can, requirePermission } from "@/lib/auth/can";
import { reportsReady } from "@/lib/db-ready";
import { fmtNum } from "@/lib/format";
import { KIND_FA, loadRules, maxScore } from "@/lib/leads/score";
import styles from "../../panel.module.css";
import { createRuleAction, deleteRuleAction, updateRuleAction } from "./actions";

export const metadata: Metadata = { title: "قانون‌های امتیاز جدیت" };

const n = (v: string | null) => (v === null ? "" : String(Number(v)));

// قانون‌های امتیاز جدیت مشتری. دیدن: reports.view؛ ویرایش: settings.manage. docs/infoyaarchin.md بخش ۲۸.
export default async function ScoringPage() {
  const a = await requirePermission("reports.view");
  const ready = await reportsReady();
  const edit = await can(a.user, "settings.manage");
  const rules = await loadRules();
  const max = maxScore(rules.filter((r) => r.enabled));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>قانون‌های امتیاز جدیت</h1>
          <p className={styles.pageSub}>
            <Link href="/admin/reports">گزارش‌ها</Link> · امتیاز هر قانون = تعداد واحد × امتیاز هر واحد (حداکثر تا سقف). جمع قانون‌های روشن = امتیاز مشتری
            {max !== null ? ` (حداکثر ${fmtNum(max)})` : ""}. امتیاز همیشه زنده از رفتار فعلی حساب می‌شود.
          </p>
        </div>
      </div>
      {!ready && <div className={styles.impersonation}>این بخش بعد از اجرای migration ۰۰۰۹ فعال می‌شود (در کنسول لیارا npm run db:migrate و بعد npm run db:seed).</div>}
      {ready && !edit && <p className={styles.notice}>برای تغییر قانون‌ها دسترسی «تنظیمات و سوئیچ‌ها» (settings.manage) لازم است.</p>}

      {rules.map((r) => (
        <div key={r.id} className={styles.card} style={{ marginBottom: 12 }}>
          <h2 className={styles.cardTitle}>
            {r.labelFa} {!r.enabled && <span className={`${styles.badge} ${styles.badgeMuted}`}>خاموش</span>}
            {r.source === "ai" && <span className={styles.badge}>از AI</span>}
          </h2>
          <p className={styles.muted} style={{ marginTop: -6, fontSize: 13 }}>
            واحد: {KIND_FA[r.kind] ?? r.kind}
            {r.kind === "signal" ? ` — کلید ${String((r.params as { signal?: string }).signal ?? "")}` : ""}
          </p>
          {edit ? (
            <ActionForm action={updateRuleAction} submitLabel="ذخیره" submitVariant="secondary">
              <input type="hidden" name="id" value={r.id} />
              <div className={styles.row}>
                <Field label="اسم" name="labelFa" defaultValue={r.labelFa} maxLength={120} required />
                <Field label="امتیاز هر واحد" name="points" defaultValue={n(r.points)} inputMode="decimal" ltr required />
                <Field label="سقف (خالی = بدون سقف)" name="cap" defaultValue={n(r.cap)} inputMode="decimal" ltr />
                <Field label="فقط N روز اخیر (خالی = همه)" name="windowDays" defaultValue={r.windowDays ?? ""} inputMode="numeric" ltr />
              </div>
              <Checkbox name="enabled" label="روشن" defaultChecked={r.enabled} />
            </ActionForm>
          ) : (
            <p style={{ margin: 0 }}>
              {fmtNum(Number(r.points))} امتیاز هر واحد{r.cap !== null ? `، سقف ${fmtNum(Number(r.cap))}` : ""}
              {r.windowDays ? `، ${fmtNum(r.windowDays)} روز اخیر` : ""}
            </p>
          )}
          {edit && r.source !== "system" && (
            <form action={deleteRuleAction} style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className={styles.btnGhost}>
                حذف این قانون
              </button>
            </form>
          )}
        </div>
      ))}

      {ready && edit && (
        <details className={styles.detailsBox}>
          <summary>+ قانون تازه</summary>
          <ActionForm action={createRuleAction} submitLabel="افزودن">
            <label className={ui.field}>
              <span className={ui.label}>نوع (منبع داده)</span>
              <select name="kind" className={ui.select} defaultValue="signal">
                {LEAD_RULE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_FA[k]}
                  </option>
                ))}
              </select>
            </label>
            <Field label="کلید نشانه (فقط برای نوع «نشانه»)" name="signal" ltr placeholder="orders_count" hint="مقدارهایی که بسته‌ی AI بعداً در customer_signals می‌نویسد." />
            <div className={styles.row}>
              <Field label="اسم" name="labelFa" maxLength={120} required />
              <Field label="امتیاز هر واحد" name="points" inputMode="decimal" ltr required />
              <Field label="سقف" name="cap" inputMode="decimal" ltr />
              <Field label="فقط N روز اخیر" name="windowDays" inputMode="numeric" ltr />
            </div>
            <Checkbox name="enabled" label="روشن" defaultChecked />
          </ActionForm>
        </details>
      )}
    </>
  );
}
