// یکسان‌سازی موبایل و ایمیل — منبع واحد برای سایت (TypeScript) و اسکریپت create-admin (Node خالص).
// به همین دلیل .mjs و بدون وابستگی است (مثل auth/password-policy.mjs).

const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";

/** ارقام فارسی/عربی → لاتین @param {string} s @returns {string} */
export function toLatinDigits(s) {
  return s.replace(/[۰-۹٠-٩]/g, (ch) => {
    const i = FA.indexOf(ch);
    return String(i >= 0 ? i : AR.indexOf(ch));
  });
}

/**
 * موبایل ایران به شکل استاندارد 09xxxxxxxxx (یا null اگر معتبر نیست).
 * +98، 0098، 98، و شروع با 9 هم قبول می‌شود.
 * @param {string} input @returns {string | null}
 */
export function normalizeMobile(input) {
  let s = toLatinDigits(input).replace(/[\s\-()]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  else if (s.startsWith("0098")) s = "0" + s.slice(4);
  else if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  else if (s.startsWith("9") && s.length === 10) s = "0" + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

/**
 * ایمیل با حروف کوچک (یا null). ایمیل همیشه کوچک ذخیره می‌شود؛ ایندکس یکتای دیتابیس هم روی lower(email) است.
 * @param {string} input @returns {string | null}
 */
export function normalizeEmail(input) {
  const s = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}
