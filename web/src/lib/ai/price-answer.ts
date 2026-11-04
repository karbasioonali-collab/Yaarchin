import "server-only";
// «جواب قیمت با کد» (بخش ۴۶): داده‌ی همان صفحه‌ی محصول (loadPublishedProduct؛ بدون اطلاعات کارخانه) ← price-reply.ts
import { loadPublishedProduct } from "@/lib/catalog/public";
import { slugOf } from "./context";
import { buildPriceReply, isPriceOnlyQuestion } from "./price-reply";

// پیش‌صافی ارزان قبل از دیتابیس: یک کلمه‌ی قیمت (رقم بعد از حذف اسم محصول سنجیده می‌شود)
const MAYBE = /قیمت|چند|چقد|تومن|تومان|دلار/;

// متن جواب قیمت، یا null (سؤال فقط قیمت نیست، محصول منتشرشده نیست، یا قیمت ندارد) ← مسیر قبلی
export async function priceAnswer(productId: string | null, text: string): Promise<string | null> {
  if (!productId || !MAYBE.test(text.replace(/ي/g, "ی").replace(/ك/g, "ک"))) return null;
  const slug = await slugOf(productId);
  const p = slug ? await loadPublishedProduct(slug) : null;
  if (!p || !isPriceOnlyQuestion(text, p.titleFa)) return null;
  return buildPriceReply({ title: p.titleFa, unit: p.price?.unit ?? "piece", price: p.price, toman: p.priceToman, landed: p.landedCost });
}

// عنوان محصول‌های منتشرشده برای تخمین هزینه‌ی آزمون (کدام سؤال‌ها با کد جواب می‌گیرند)
export async function publishedTitles(slugs: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const s of [...new Set(slugs)]) {
    const p = await loadPublishedProduct(s);
    if (p?.price) out.set(s, p.titleFa);
  }
  return out;
}
