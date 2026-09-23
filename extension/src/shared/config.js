// تنظیمات مشترک اکستنشن. هر چیزی که بعداً قابل‌تنظیم می‌شود اینجاست.

export const DB_NAME = "yarchin";
export const DB_VERSION = 1;

// ساختار داده‌ی هر ثبت. با هر تغییر ساختار، این عدد بالا می‌رود
// تا سرور بتواند نسخه‌های قدیمی را هم بخواند.
export const CAPTURE_SCHEMA_VERSION = 1;

export const STORES = {
  // متادیتای سبک هر ثبت (برای لیست)
  captures: "captures",
  // داده‌ی سنگین (HTML کامل و متن) جدا نگه داشته می‌شود
  bodies: "bodies",
};

// پیام‌های بین content script، service worker و صفحه‌ی لیست
export const MSG = {
  SAVE_CAPTURE: "yarchin/save-capture",
  GET_LAST_GROUP: "yarchin/get-last-group",
  OPEN_LIST: "yarchin/open-list",
};

// کلیدهای chrome.storage.local (فقط داده‌های کوچک)
export const PREF_KEYS = {
  lastGroupName: "lastGroupName",
};

// ارسال به سرور در نسخه‌ی صفر خاموش است و هیچ درخواستی بیرون نمی‌رود.
export const SERVER_SYNC_ENABLED = false;

export const EXPORT_FOLDER = "yarchin";
