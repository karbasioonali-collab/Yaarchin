import { NextResponse } from "next/server";
import { canAny } from "@/lib/auth/can";
import { getAuth } from "@/lib/auth/current";
import { CHAT_PERMS, chatAccess } from "@/lib/chat/access";
import { chatCounters, pulseEvents } from "@/lib/chat/admin";
import { chatReady } from "@/lib/db-ready";

// «نبض» پنل برای کامپوننت PanelPulse (هر ۱۵ ثانیه وقتی تب جلوی چشم است، هر ۴۵ ثانیه در پس‌زمینه):
// شمارنده‌ی نشان منو و عنوان تب، و رویدادهای تازه برای اعلان مرورگر بعد از cursor (شماره‌ی آخرین پیام دیده‌شده).
// اولین درخواست cursor=0 می‌فرستد و فقط cursor فعلی را می‌گیرد (اعلان قدیمی پخش نمی‌شود).
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const a = await getAuth();
  if (!a?.user.isStaff) return json({ error: "login_required" }, 401);
  if (!(await chatReady()) || !(await canAny(a.user, CHAT_PERMS))) return json({ counters: { mine: 0, unassigned: 0, total: 0 }, cursor: 0, events: [] });
  const access = await chatAccess(a.user);
  const cursor = Math.max(0, Math.floor(Number(new URL(req.url).searchParams.get("cursor")) || 0));
  const [counters, p] = await Promise.all([chatCounters(access), pulseEvents(access, cursor)]);
  return json({ counters, ...p });
}
