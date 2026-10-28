"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// تازه کردن صفحه‌ی اجرای آزمون هر ۲ ثانیه تا وقتی در حال اجراست (پیشرفت زنده)
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
