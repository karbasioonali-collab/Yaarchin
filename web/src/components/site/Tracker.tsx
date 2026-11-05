"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// برای مشتری و مهمان (نه کارمند واردشده) در قالب سایت رندر می‌شود: بعد از باز شدن هر صفحه، مسیرش را به /api/v1/events می‌فرستد.
// (بازدید محصول/دسته و «ورود روزانه به سایت»؛ lib/customer/events.ts و lib/site/guest.ts، بخش ۴۸)
// keepalive و catch: صفحه هیچ‌وقت منتظر یا خراب نمی‌شود.
export function Tracker() {
  const path = usePathname();
  useEffect(() => {
    const referrer = document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : null;
    fetch("/api/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, referrer }),
      keepalive: true,
    }).catch(() => {});
  }, [path]);
  return null;
}
