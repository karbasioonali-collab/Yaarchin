import "server-only";
// جواب‌های آماده‌ی احوال‌پرسی، تشکر و خداحافظی (بدون مدل، هزینه صفر). متن‌ها از پنل «دستیار هوشمند» قابل ویرایش‌اند
// (تنظیم‌های ai.reply_*)؛ تا seed اجرا نشده، همین پیش‌فرض‌ها. {product} = اسم محصول همان گفتگو. docs/infoyaarchin.md بخش ۳۱.
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { getSetting } from "@/lib/settings";
import type { Pleasantry } from "./rules";

export const CANNED_DEFAULTS = {
  "ai.reply_greeting_product":
    "سلام، وقت‌تان بخیر! من دستیار هوشمند یارچین هستم. درباره‌ی «{product}» هر سؤالی دارید بپرسید؛ مثلاً مشخصات، حداقل سفارش، زمان رسیدن یا قیمت تخمینی تا ایران برای تعداد دلخواه.",
  "ai.reply_greeting_general": "سلام، وقت‌تان بخیر! من دستیار هوشمند یارچین هستم. درباره‌ی محصولات سایت، حداقل سفارش، زمان رسیدن یا قیمت تخمینی تا ایران هر سؤالی دارید بپرسید.",
  "ai.reply_thanks": "خواهش می‌کنم! اگر سؤال دیگری داشتید، همین‌جا بپرسید.",
  "ai.reply_bye": "خواهش می‌کنم، خدانگهدار! هر وقت سؤالی داشتید، همین‌جا در خدمتیم.",
} as const;
export type CannedKey = keyof typeof CANNED_DEFAULTS;

export async function cannedText(key: CannedKey): Promise<string> {
  const v = await getSetting<string>(key).catch(() => null);
  return typeof v === "string" && v.trim() ? v.trim() : CANNED_DEFAULTS[key];
}

export async function cannedReply(kind: Pleasantry, productId: string | null): Promise<string> {
  if (kind === "thanks") return cannedText("ai.reply_thanks");
  if (kind === "bye") return cannedText("ai.reply_bye");
  const [p] = productId
    ? await db
        .select({ title: products.titleFa })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.status, "published")))
    : [];
  if (p) return (await cannedText("ai.reply_greeting_product")).replaceAll("{product}", p.title);
  return (await cannedText("ai.reply_greeting_general")).replaceAll("«{product}»", "محصولات سایت").replaceAll("{product}", "محصولات سایت");
}
