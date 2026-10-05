// مقصد امن بعد از ورود یا دکمه‌ی «بازگشت» (پارامتر ?next=).
// فقط مسیرهای داخلی که واقعاً وجود دارند؛ هر چیز دیگری (مسیر ناموجود، آدرس بیرونی، //evil.com) ← «/».
// صفحه‌ی عمومی یا صفحه‌ی مشتری تازه‌ای ساخته شد؟ اینجا اضافه کن. docs/infoyaarchin.md بخش ۱۷ و ۱۸.
const ALLOWED = [
  /^\/$/,
  /^\/categories$/,
  /^\/about$/,
  /^\/contact$/,
  /^\/c\/[a-z0-9-]+$/,
  // #chat: بعد از ورود، صفحه‌ی محصول روی باکس گفتگو باز می‌شود
  /^\/p\/[a-z0-9-]+(#chat)?$/,
  /^\/favorites$/,
  /^\/account$/,
  /^\/account\/recent$/,
  /^\/account\/chats$/,
  /^\/account\/chats\/[0-9a-f-]{36}$/,
];

export function safeNext(next: unknown): string {
  return typeof next === "string" && ALLOWED.some((re) => re.test(next)) ? next : "/";
}
