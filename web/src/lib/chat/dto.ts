// شکل پیام برای مرورگر (بدون server-only تا کامپوننت‌های client هم نوعش را بگیرند).
// مشتری اسم کارشناس را نمی‌بیند («کارشناس یارچین»)؛ رویدادهای داخلی (ارجاع) اصلاً به مشتری فرستاده نمی‌شوند.
export type SenderType = "customer" | "staff" | "system" | "ai";
export type CustomerMsg = { id: number; from: "me" | "staff" | "system" | "ai"; body: string; at: string; event: boolean };
export type StaffMsg = { id: number; from: SenderType; name: string | null; body: string; at: string; event: boolean; internal: boolean };

type Row = { id: number; senderType: SenderType; body: string; createdAt: Date; kind: "text" | "event"; visibleToCustomer: boolean; senderName?: string | null };

export function toCustomerMsg(m: Row): CustomerMsg {
  return { id: m.id, from: m.senderType === "customer" ? "me" : m.senderType, body: m.body, at: m.createdAt.toISOString(), event: m.kind === "event" };
}

export function toStaffMsg(m: Row): StaffMsg {
  return { id: m.id, from: m.senderType, name: m.senderName ?? null, body: m.body, at: m.createdAt.toISOString(), event: m.kind === "event", internal: !m.visibleToCustomer };
}

export const SENDER_FA: Record<SenderType, string> = { customer: "مشتری", staff: "کارشناس", system: "سیستم", ai: "دستیار هوش مصنوعی" };
