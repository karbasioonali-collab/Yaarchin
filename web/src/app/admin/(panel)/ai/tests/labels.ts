// برچسب‌های فارسی صفحه‌های آزمون دستیار
export const CATEGORY_FA: Record<string, string> = { normal: "معمولی", tricky: "فریبنده", handoff: "ارجاع" };
export const RUN_STATUS_FA: Record<string, string> = { running: "در حال اجرا", done: "تمام شد", stopped: "متوقف شد", interrupted: "قطع شد (ری‌استارت سرور)", failed: "خطا" };
export const PATH_FA: Record<string, string> = {
  canned: "جواب آماده",
  rule: "قاعده‌ی کد (رایگان)",
  model: "مدل",
  error: "خطا",
  stop: "رد شد (توقف)",
  cap: "رد شد (سقف)",
  interrupted: "رد شد (قطع اجرا)",
};
export const CHECK_FA: Record<string, string> = { error: "بدون خطا", guard: "محافظ", handoff: "ارجاع", source: "منبع", forbidden: "کلمه‌ی ممنوع", mustInclude: "کلمه‌ی لازم" };
export const SOURCE_FA: Record<string, string> = { product: "محصول", calculator: "ماشین‌حساب", knowledge: "پایگاه دانش", general: "عمومی", canned: "جواب آماده" };
