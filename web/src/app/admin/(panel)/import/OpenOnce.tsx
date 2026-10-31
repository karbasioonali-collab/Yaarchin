"use client";
// <details> که فقط در اولین رندر خودش باز می‌شود (مثلاً وقتی «Quantity» مبهم هنوز انتخاب نشده). docs/infoyaarchin.md بخش ۳۷.
// با open معمولی، بعد از «ذخیره‌ی اصلاح‌ها» سرور صفحه را دوباره می‌سازد، open=false می‌شود و جعبه پیام «ذخیره شد» را پنهان می‌کند.
import { type ReactNode, useState } from "react";

export function OpenOnce({ initialOpen, className, style, children }: { initialOpen: boolean; className?: string; style?: React.CSSProperties; children: ReactNode }) {
  const [open] = useState(initialOpen);
  return (
    <details className={className} style={style} open={open || undefined}>
      {children}
    </details>
  );
}
