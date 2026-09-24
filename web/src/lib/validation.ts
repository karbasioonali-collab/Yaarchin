// یکسان‌سازی ورودی‌ها. توابع پایه در contact.mjs هستند (مشترک با اسکریپت create-admin).
import { normalizeEmail, normalizeMobile } from "./contact.mjs";

export { normalizeEmail, normalizeMobile, toLatinDigits } from "./contact.mjs";

// ورود با موبایل یا ایمیل (هر کدام که کاربر ترجیح می‌دهد)
export function parseIdentifier(input: string): { kind: "mobile" | "email"; value: string } | null {
  const email = input.includes("@") ? normalizeEmail(input) : null;
  if (email) return { kind: "email", value: email };
  const mobile = normalizeMobile(input);
  return mobile ? { kind: "mobile", value: mobile } : null;
}
