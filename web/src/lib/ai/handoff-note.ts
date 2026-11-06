// جمله‌ی ساعت اداری در پیام ارجاع به کارشناس (بخش ۵۶). خالص؛ با کد اضافه می‌شود، نه با دستورالعمل مدل (دستورالعمل نزدیک سقف طول است).
// هر سه پیام ارجاع: HANDOFF_TEXT و RESTRICTED_TEXT (agent.ts) و GUARD_REPLACEMENT (guard.ts) — قاعده‌های کد، تصمیم مدل، امتیاز جدیت،
// سقف‌ها و خطا همه از handoff() یا همان دو جای RESTRICTED_TEXT رد می‌شوند. اگر جمله از قبل باشد، تکرار نمی‌شود.
export const OFFICE_HOURS_NOTE = "کارشناسان یارچین در ساعت اداری پاسخ می‌دهند.";
export const withOfficeHours = (text: string): string => (text.includes(OFFICE_HOURS_NOTE) ? text : `${text.trimEnd()} ${OFFICE_HOURS_NOTE}`);
