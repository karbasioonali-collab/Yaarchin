// تب‌های پنل مشتری (سایت). بخش تازه = یک سطر اینجا + یک صفحه، بدون تغییر ساختار.
import type { IconName } from "@/components/site/Icon";

// feature: تب فقط وقتی سوئیچ features.<feature> روشن است نمایش داده می‌شود (AccountShell).
export type AccountTab = { href: string; label: string; icon: IconName; feature?: string };

export const ACCOUNT_TABS: AccountTab[] = [
  { href: "/account", label: "حساب من", icon: "user" },
  { href: "/favorites", label: "علاقه‌مندی‌ها", icon: "heart" },
  { href: "/account/recent", label: "بازدیدهای اخیر", icon: "clock" },
  { href: "/account/chats", label: "گفتگوهای من", icon: "chat", feature: "chat" },
];
