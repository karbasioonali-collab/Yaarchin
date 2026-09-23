// یکسان‌سازی ورودی‌ها (ارقام فارسی/عربی → لاتین، موبایل استاندارد).

const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";

export function toLatinDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (ch) => {
    const i = FA.indexOf(ch);
    return String(i >= 0 ? i : AR.indexOf(ch));
  });
}

// خروجی: 09xxxxxxxxx یا null
export function normalizeMobile(input: string): string | null {
  let s = toLatinDigits(input).replace(/[\s\-()]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  else if (s.startsWith("0098")) s = "0" + s.slice(4);
  else if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  else if (s.startsWith("9") && s.length === 10) s = "0" + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

export function normalizeEmail(input: string): string | null {
  const s = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

// ورود با موبایل یا ایمیل
export function parseIdentifier(input: string): { kind: "mobile" | "email"; value: string } | null {
  const email = input.includes("@") ? normalizeEmail(input) : null;
  if (email) return { kind: "email", value: email };
  const mobile = normalizeMobile(input);
  return mobile ? { kind: "mobile", value: mobile } : null;
}
