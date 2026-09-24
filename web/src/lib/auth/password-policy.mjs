// قانون رمز عبور — منبع واحد برای سایت (TypeScript) و اسکریپت create-admin (Node خالص).
// به همین دلیل .mjs و بدون وابستگی است. اگر قانون عوض شد، فقط همین فایل را عوض کن.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const RULES = [
  { test: (p) => p.length >= PASSWORD_MIN_LENGTH, message: `حداقل ${PASSWORD_MIN_LENGTH.toLocaleString("fa-IR")} کاراکتر` },
  { test: (p) => p.length <= PASSWORD_MAX_LENGTH, message: `حداکثر ${PASSWORD_MAX_LENGTH.toLocaleString("fa-IR")} کاراکتر` },
  { test: (p) => /[A-Z]/.test(p), message: "حداقل یک حرف بزرگ انگلیسی (A-Z)" },
  { test: (p) => /[a-z]/.test(p), message: "حداقل یک حرف کوچک انگلیسی (a-z)" },
  { test: (p) => /[0-9۰-۹٠-٩]/.test(p), message: "حداقل یک عدد" },
  // نماد: هر کاراکتری غیر از حرف، عدد و فاصله (مثل ! @ # $ % - _ .)
  { test: (p) => /[^\p{L}\p{N}\s]/u.test(p), message: "حداقل یک نماد (مثل ! @ # $ % - _)" },
];

/**
 * @param {string} password
 * @returns {string[]} قانون‌هایی که رعایت نشده‌اند (خالی یعنی رمز قبول است)
 */
export function passwordProblems(password) {
  const p = typeof password === "string" ? password : "";
  return RULES.filter((r) => !r.test(p)).map((r) => r.message);
}

/**
 * پیام خطای فارسی یا null.
 * @param {string} password
 * @returns {string | null}
 */
export function passwordError(password) {
  const problems = passwordProblems(password);
  return problems.length ? `رمز قابل قبول نیست: ${problems.join("، ")}.` : null;
}

export const PASSWORD_HINT = `حداقل ${PASSWORD_MIN_LENGTH.toLocaleString("fa-IR")} کاراکتر، شامل حرف بزرگ و کوچک انگلیسی، عدد و نماد.`;
