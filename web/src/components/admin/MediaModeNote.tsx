// نوار «حالت آزمایشی» کنار هر جای آپلود: تا فضای ابری لیارا وصل نشده، فایل‌ها روی دیسک برنامه‌اند و با هر استقرار پاک می‌شوند.
import { fmtNum } from "@/lib/format";
import { fmtMb, localSpaceInfo, mediaLimits } from "@/lib/media/service";
import styles from "@/app/admin/(panel)/panel.module.css";

export async function MediaModeNote({ ready }: { ready: boolean }) {
  if (!ready) {
    return <div className={styles.impersonation}>آپلود بعد از اجرای migration ۰۰۰۸ فعال می‌شود (در کنسول لیارا npm run db:migrate). فعلاً آدرس عکس را دستی وارد کنید.</div>;
  }
  const l = await mediaLimits();
  if (l.mode === "s3") return null;
  const { usedBytes, freeBytes } = await localSpaceInfo();
  return (
    <div className={styles.impersonation} role="note">
      <span>
        <strong>حالت آزمایشی آپلود:</strong> فضای ابری لیارا هنوز وصل نیست؛ فایل‌ها روی دیسک خود برنامه‌اند و <strong>با هر استقرار پاک می‌شوند</strong>. مصرف: {fmtMb(usedBytes)}{" "}
        از {fmtNum(l.testTotalMb)} مگابایت{freeBytes !== null ? ` (آزاد روی دیسک: ${fmtMb(freeBytes)} مگابایت)` : ""}؛ ویدیو حداکثر{" "}
        {fmtNum(Math.min(l.videoMaxMb, l.testVideoMaxMb))} مگابایت.
      </span>
    </div>
  );
}
