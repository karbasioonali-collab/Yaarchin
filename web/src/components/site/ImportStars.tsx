import { fmtImportScore } from "@/lib/catalog/import-score";
import styles from "./ImportStars.module.css";

const STAR = "M12 2.6l2.86 5.8 6.4.93-4.63 4.51 1.09 6.37L12 17.2l-5.72 3.01 1.09-6.37L2.74 9.33l6.4-.93z";

// ۵ ستاره‌ی «جذاب برای واردات» به رنگ نارنجی برند. امتیاز ندارد ← هیچ چیز رندر نمی‌شود.
// برای صفحه‌خوان یک برچسب نامرئی دارد («امتیاز ۴٫۵ از ۵»)؛ متن قابل‌دیدن ندارد (کارت‌ها فقط ستاره می‌خواهند).
export function ImportStars({ score, size = 16, className }: { score: number | null; size?: number; className?: string }) {
  if (score === null) return null;
  return (
    <span className={`${styles.stars} ${className ?? ""}`} role="img" aria-label={`امتیاز جذابیت برای واردات: ${fmtImportScore(score)} از ۵`}>
      {[1, 2, 3, 4, 5].map((i) => {
        // پرشدگی این ستاره: ۱، نیمه (۰٫۵) یا ۰
        const fill = Math.max(0, Math.min(1, score - (i - 1)));
        return (
          <span key={i} className={styles.star} style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" width={size} height={size} className={styles.empty} aria-hidden="true">
              <path d={STAR} />
            </svg>
            {fill > 0 && (
              // در RTL ستاره از سمت راست پر می‌شود (سمت چپ بریده می‌شود)
              <svg viewBox="0 0 24 24" width={size} height={size} className={styles.full} style={{ clipPath: `inset(0 0 0 ${(1 - fill) * 100}%)` }} aria-hidden="true">
                <path d={STAR} />
              </svg>
            )}
          </span>
        );
      })}
    </span>
  );
}
