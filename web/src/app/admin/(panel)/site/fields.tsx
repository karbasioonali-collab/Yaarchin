import type { ReactNode } from "react";
import ui from "@/components/ui/ui.module.css";
import type { SiteLink } from "@/lib/site/blocks";
import styles from "./site.module.css";

// فیلدهای فرم «محتوای سایت». نام‌ها طبق قرارداد lib/site/form.ts (b: / n: / l: و مسیر نقطه‌دار).

export function Text({ name, label, value, hint, ltr, max = 200 }: { name: string; label: string; value: string; hint?: ReactNode; ltr?: boolean; max?: number }) {
  return (
    <label className={ui.field}>
      <span className={ui.label}>{label}</span>
      <input className={`${ui.input} ${ltr ? ui.ltr : ""}`} name={name} defaultValue={value} maxLength={max} dir={ltr ? "ltr" : undefined} />
      {hint && <span className={ui.hint}>{hint}</span>}
    </label>
  );
}

export function Area({ name, label, value, hint, rows = 3, max = 2000 }: { name: string; label: string; value: string; hint?: ReactNode; rows?: number; max?: number }) {
  return (
    <label className={ui.field}>
      <span className={ui.label}>{label}</span>
      <textarea className={ui.textarea} name={name} defaultValue={value} rows={rows} maxLength={max} />
      {hint && <span className={ui.hint}>{hint}</span>}
    </label>
  );
}

export function Num({ name, label, value, min, max }: { name: string; label: string; value: number; min: number; max: number }) {
  return (
    <label className={ui.field}>
      <span className={ui.label}>{label}</span>
      <input className={`${ui.input} ${ui.ltr}`} type="number" name={`n:${name}`} defaultValue={value} min={min} max={max} dir="ltr" />
    </label>
  );
}

// سوئیچ نمایش: input مخفی 0 + چک‌باکس 1
export function Show({ name, value, label = "نمایش داده شود" }: { name: string; value: boolean; label?: string }) {
  return (
    <label className={styles.show}>
      <input type="hidden" name={`b:${name}`} value="0" />
      <input type="checkbox" className={ui.toggle} name={`b:${name}`} value="1" defaultChecked={value} />
      <span>{label}</span>
    </label>
  );
}

// یک بخش از بلوک با سوئیچ «نمایش» در سربرگ
export function Part({ title, visible, children, hint }: { title: string; visible?: { name: string; value: boolean }; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className={styles.part}>
      <div className={styles.partHead}>
        <h2 className={styles.partTitle}>{title}</h2>
        {visible && <Show name={visible.name} value={visible.value} />}
      </div>
      {hint && <p className={ui.hint}>{hint}</p>}
      <div className={styles.partBody}>{children}</div>
    </section>
  );
}

// ویرایش فهرست لینک با تعداد ردیف ثابت؛ ردیف خالی نادیده گرفته می‌شود
export function LinkRows({ name, links, rows = 6 }: { name: string; links: SiteLink[]; rows?: number }) {
  const list = [...links, ...Array.from({ length: Math.max(0, rows - links.length) }, () => ({ label: "", href: "" }))];
  return (
    <div className={styles.linkRows}>
      <div className={styles.linkHead}>
        <span>متن لینک</span>
        <span>آدرس</span>
      </div>
      {list.map((l, i) => (
        <div key={i} className={styles.linkRow}>
          <input className={ui.input} name={`${name}.${i}.label`} defaultValue={l.label} maxLength={60} aria-label={`متن لینک ${i + 1}`} />
          <input className={`${ui.input} ${ui.ltr}`} name={`${name}.${i}.href`} defaultValue={l.href} maxLength={500} dir="ltr" placeholder="/about یا https://…" aria-label={`آدرس لینک ${i + 1}`} />
        </div>
      ))}
      <span className={ui.hint}>برای حذف یک لینک، هر دو خانه‌اش را خالی کنید. آدرس داخلی با / شروع می‌شود (مثل /contact).</span>
    </div>
  );
}
