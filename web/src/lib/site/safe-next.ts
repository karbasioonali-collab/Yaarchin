// مقصد امن بعد از ورود یا دکمه‌ی «بازگشت» (پارامتر ?next=).
// فقط مسیرهای داخلی که واقعاً وجود دارند؛ هر چیز دیگری (مسیر ناموجود، آدرس بیرونی، //evil.com) ← «/».
// صفحه‌ی عمومی یا صفحه‌ی مشتری تازه‌ای ساخته شد؟ اینجا اضافه کن. docs/infoyaarchin.md بخش ۱۷ و ۱۸.
const ALLOWED = [
  /^\/$/,
  /^\/categories$/,
  /^\/about$/,
  /^\/contact$/,
  /^\/c\/[a-z0-9-]+$/,
  /^\/p\/[a-z0-9-]+$/,
  /^\/favorites$/,
  /^\/account$/,
  /^\/account\/recent$/,
];

export function safeNext(next: unknown): string {
  return typeof next === "string" && ALLOWED.some((re) => re.test(next)) ? next : "/";
}
