// لایه‌ی ارسال به سرور. در نسخه‌ی صفر خاموش است و هیچ درخواستی نمی‌فرستد.
// در مرحله‌ی ۸ اینجا به /api/v1 وصل می‌شود؛ بقیه‌ی کد نباید مستقیم fetch کند.

import { SERVER_SYNC_ENABLED } from "./config.js";

export function isServerSyncEnabled() {
  return SERVER_SYNC_ENABLED;
}

export async function sendCapture(_capture) {
  if (!SERVER_SYNC_ENABLED) return { sent: false, reason: "disabled" };
  throw new Error("server sync not implemented in v0");
}
