import styles from "./Logo.module.css";

// لوگوی موقت: اسم گرد سبز، خط منحنی گرادیان سبز→نارنجی بالای آن و شعار زیرش.
// با رسیدن فایل لوگوی نهایی فقط همین کامپوننت عوض می‌شود.
// gradientId: اگر نسخه‌ای از لوگو داخل بخشی باشد که رندر نمی‌شود (مثل کشوی بسته‌ی منو)، باید id جدا بگیرد؛
// وگرنه همه‌ی لوگوهای صفحه به همان گرادیانِ رندرنشده اشاره می‌کنند و خط منحنی دیده نمی‌شود.
export function Logo({ size = "md", tagline = true, gradientId = "yarchin-arc" }: { size?: "sm" | "md" | "lg"; tagline?: boolean; gradientId?: string }) {
  return (
    <div className={`${styles.logo} ${styles[size]}`}>
      <svg className={styles.arc} viewBox="0 0 120 20" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1">
            <stop offset="0" stopColor="#2F7D5C" />
            <stop offset="1" stopColor="#FF7A00" />
          </linearGradient>
        </defs>
        <path d="M4 16 Q60 -6 116 16" fill="none" stroke={`url(#${gradientId})`} strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className={styles.name}>یارچین</span>
      {tagline && <span className={styles.tagline}>پل واردات از چین به ایران</span>}
    </div>
  );
}
