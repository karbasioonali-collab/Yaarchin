// قانون رمز مشتری: حداقل ۸ کاراکتر (ساده‌تر از رمز پنل که حداقل ۱۲ کاراکتر با حرف بزرگ/کوچک، عدد و نماد است).
// بدون server-only تا فرم‌ها هم راهنما را نشان دهند.
export const CUSTOMER_PASSWORD_MIN = 8;
export const CUSTOMER_PASSWORD_MAX = 128;
export const CUSTOMER_PASSWORD_HINT = "حداقل ۸ کاراکتر.";

export function customerPasswordError(p: string): string | null {
  if (p.length < CUSTOMER_PASSWORD_MIN) return "رمز باید حداقل ۸ کاراکتر باشد.";
  if (p.length > CUSTOMER_PASSWORD_MAX) return "رمز حداکثر ۱۲۸ کاراکتر است.";
  return null;
}
