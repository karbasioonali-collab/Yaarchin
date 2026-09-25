// تب‌های پنل مشتری (سایت). بخش تازه = یک سطر اینجا + یک صفحه، بدون تغییر ساختار.
// مرحله‌ی بعد: { href: "/account/chats", label: "گفتگوهای من", icon: "chat" }
import type { IconName } from "@/components/site/Icon";

export type AccountTab = { href: string; label: string; icon: IconName };

export const ACCOUNT_TABS: AccountTab[] = [
  { href: "/account", label: "حساب من", icon: "user" },
  { href: "/favorites", label: "علاقه‌مندی‌ها", icon: "heart" },
  { href: "/account/recent", label: "بازدیدهای اخیر", icon: "clock" },
];
