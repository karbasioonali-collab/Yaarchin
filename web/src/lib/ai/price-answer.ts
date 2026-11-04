import "server-only";
// «جواب قیمت با کد» (بخش ۴۶): داده‌ی همان صفحه‌ی محصول (loadPublishedProduct؛ بدون اطلاعات کارخانه) ← price-reply.ts
import { landedForSlug, loadPublishedProduct } from "@/lib/catalog/public";
import { slugOf } from "./context";
import { buildPriceReply, buildQtyPriceReply, isPriceOnlyQuestion, priceQtyQuestion } from "./price-reply";

// پیش‌صافی ارزان قبل از دیتابیس: یک کلمه‌ی قیمت (رقم بعد از حذف اسم محصول سنجیده می‌شود)
const MAYBE = /قیمت|چند|چقد|تومن|تومان|دلار|درمیاد|در میاد|تموم/;

// kind: price = بدون تعداد (منبع «محصول»)، qty_price = برای یک تعداد (بخش ۴۷؛ منبع «ماشین‌حساب»)
export type PriceAnswer = { text: string; kind: "price" | "qty_price"; source: "product" | "calculator"; qty?: number };

// متن جواب قیمت، یا null (سؤال فقط قیمت نیست، محصول منتشرشده نیست، یا قیمت ندارد) ← مسیر قبلی
export async function priceAnswer(productId: string | null, text: string): Promise<PriceAnswer | null> {
  if (!productId || !MAYBE.test(text.replace(/ي/g, "ی").replace(/ك/g, "ک"))) return null;
  const slug = await slugOf(productId);
  const p = slug ? await loadPublishedProduct(slug) : null;
  if (!p || !p.price) return null;
  if (isPriceOnlyQuestion(text, p.titleFa)) {
    const t = buildPriceReply({ title: p.titleFa, unit: p.price.unit, price: p.price, toman: p.priceToman, landed: p.landedCost });
    return t ? { text: t, kind: "price", source: "product" } : null;
  }
  const qty = priceQtyQuestion(text, p.titleFa);
  if (qty === null) return null;
  // همان محاسبه‌ی API کارت ماشین‌حساب صفحه‌ی محصول (/api/v1/products/[slug]/landed)
  const landed = await landedForSlug(p.slug, qty);
  if (!landed) return null;
  return { text: buildQtyPriceReply({ title: p.titleFa, unit: p.price.unit, landed }, qty), kind: "qty_price", source: "calculator", qty };
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
