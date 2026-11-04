"use client";
// نمایش خروجی خام مدل با یک دکمه‌ی ساده (بخش ۴۵). قبلاً <details> بود که روی دستگاه مالک باز نمی‌شد (بازسازی نشد)؛
// دکمه با state خود React همه‌جا یکسان کار می‌کند و با تازه شدن خودکار صفحه هم بسته نمی‌شود. لینک صفحه‌ی جدا هم بدون JS کار می‌کند.
import Link from "next/link";
import { useState } from "react";

export function RawToggle({
  title,
  lines,
  raws,
  cleaned,
  suspects = [],
  href,
}: {
  title: string;
  lines: string[];
  raws: string[];
  cleaned: string[];
  suspects?: string[];
  href?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ fontSize: 12, marginTop: 4 }} data-testid="raw-toggle">
      <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} style={{ font: "inherit", padding: "2px 8px", cursor: "pointer" }} data-testid="raw-button">
        {open ? "▾" : "◂"} {title}
      </button>
      {href && (
        <>
          {" "}
          <Link href={href} data-testid="raw-link">
            صفحه‌ی خروجی خام
          </Link>
        </>
      )}
      {open && (
        <div data-testid="raw-body">
          {lines.map((l, i) => (
            <div key={i} style={{ color: "var(--muted)" }}>
              تلاش {(i + 1).toLocaleString("fa-IR")}: {l}
            </div>
          ))}
          {raws.map((x, i) => (
            <div key={i}>
              {raws.length > 1 && <div style={{ color: "var(--muted)" }}>{i === 0 ? "جواب اول" : "بعد از یادآوری"}</div>}
              <pre dir="auto" style={{ whiteSpace: "pre-wrap", margin: "4px 0", maxHeight: 240, overflow: "auto" }}>
                {x || "(خالی)"}
              </pre>
            </div>
          ))}
          {cleaned.length > 0 && <div style={{ color: "var(--muted)" }}>از متن مشتری حذف شد: {cleaned.join(" · ")}</div>}
          {suspects.length > 0 && (
            <div style={{ color: "#B3261E" }} data-testid="raw-suspects">
              عدد خارج از داده‌ها: {suspects.join(" · ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
