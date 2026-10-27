// شکل پیام برای مرورگر (بدون server-only تا کامپوننت‌های client هم نوعش را بگیرند).
// مشتری اسم کارشناس را نمی‌بیند («کارشناس یارچین»)؛ رویدادهای داخلی (ارجاع) اصلاً به مشتری فرستاده نمی‌شوند.
export type SenderType = "customer" | "staff" | "system" | "ai";
// rate: جواب دستیار هوشمند که مشتری می‌تواند 👍/👎 بزند (نه پیام «سپرده شد به کارشناس»)
export type CustomerMsg = { id: number; from: "me" | "staff" | "system" | "ai"; body: string; at: string; event: boolean; rate?: boolean };
export type StaffMsg = { id: number; from: SenderType; name: string | null; body: string; at: string; event: boolean; internal: boolean; aiSource?: string | null };

type Row = { id: number; senderType: SenderType; body: string; createdAt: Date; kind: "text" | "event"; visibleToCustomer: boolean; senderName?: string | null; meta?: unknown };
const AI_RATEABLE = new Set(["product", "calculator", "knowledge", "general"]);
// منبع جواب دستیار (meta.source) برای پنل: محصول، ماشین‌حساب، پایگاه دانش، عمومی؛ handoff/rule = پیام ارجاع
export const aiSource = (m: Row): string | null => (m.senderType === "ai" ? (((m.meta ?? {}) as { source?: string }).source ?? null) : null);

export function toCustomerMsg(m: Row): CustomerMsg {
  const src = aiSource(m);
  return { id: m.id, from: m.senderType === "customer" ? "me" : m.senderType, body: m.body, at: m.createdAt.toISOString(), event: m.kind === "event", ...(src && AI_RATEABLE.has(src) ? { rate: true } : {}) };
}

export function toStaffMsg(m: Row): StaffMsg {
  return { id: m.id, from: m.senderType, name: m.senderName ?? null, body: m.body, at: m.createdAt.toISOString(), event: m.kind === "event", internal: !m.visibleToCustomer, aiSource: aiSource(m) };
}

export const SENDER_FA: Record<SenderType, string> = { customer: "مشتری", staff: "کارشناس", system: "سیستم", ai: "دستیار هوشمند یارچین" };
export const AI_SOURCE_FA: Record<string, string> = { product: "از اطلاعات محصول", calculator: "از ماشین‌حساب", knowledge: "از پایگاه دانش", general: "پاسخ عمومی", handoff: "ارجاع به کارشناس", rule: "قاعده‌ی ثابت", canned: "جواب آماده" };
