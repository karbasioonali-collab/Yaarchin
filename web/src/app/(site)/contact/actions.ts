"use server";

import { and, count, eq, gt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { contactMessages, events } from "@/db/schema";
import { getAuth } from "@/lib/auth/current";
import { catalogReady } from "@/lib/db-ready";
import { requestMeta } from "@/lib/request";
import { getBlock } from "@/lib/site/get";
import { parseIdentifier } from "@/lib/validation";

export type ContactState = { error?: string; ok?: boolean } | null;

// محدودیت ارسال (ضد اسپم): از هر IP و هر موبایل/ایمیل یک پیام در هر ۳ دقیقه و حداکثر چند پیام در روز.
const GAP_MS = 3 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_DAY_IP = 10;
const MAX_PER_DAY_CONTACT = 5;

export async function sendContactAction(_prev: ContactState, fd: FormData): Promise<ContactState> {
  // فیلد مخفی: ربات‌ها پرش می‌کنند، آدم‌ها نمی‌بینند. جواب «موفق» می‌دهیم تا ربات چیزی یاد نگیرد.
  if (String(fd.get("website") ?? "").trim()) return { ok: true };

  const name = String(fd.get("name") ?? "").trim().replace(/\s+/g, " ");
  const contactRaw = String(fd.get("contact") ?? "").trim();
  const subjectRaw = String(fd.get("subject") ?? "").trim();
  const message = String(fd.get("message") ?? "").trim();

  if (name.length < 2 || name.length > 80) return { error: "نام را وارد کنید (۲ تا ۸۰ حرف)." };
  const id = parseIdentifier(contactRaw);
  if (!id) return { error: "یک شماره موبایل معتبر (مثل ۰۹۱۲۱۲۳۴۵۶۷) یا ایمیل وارد کنید." };
  const { data } = await getBlock("page.contact");
  const subject = data.subjects.includes(subjectRaw) ? subjectRaw : "سایر";
  if (message.length < 10) return { error: "متن پیام کوتاه است (حداقل ۱۰ حرف)." };
  if (message.length > 3000) return { error: "متن پیام طولانی است (حداکثر ۳۰۰۰ حرف)." };

  if (!(await catalogReady())) return { error: "ارسال پیام موقتاً ممکن نیست؛ چند دقیقه‌ی دیگر دوباره تلاش کنید." };

  const { ip, userAgent } = await requestMeta();
  const byContact = id.kind === "mobile" ? eq(contactMessages.mobile, id.value) : eq(contactMessages.email, id.value);
  const now = Date.now();
  const [recent] = await db
    .select({ n: count() })
    .from(contactMessages)
    .where(and(gt(contactMessages.createdAt, new Date(now - GAP_MS)), ip ? or(eq(contactMessages.ip, ip), byContact) : byContact));
  if (recent.n > 0) return { error: "پیام قبلی شما رسید. برای پیام بعدی لطفاً چند دقیقه صبر کنید." };
  const since = new Date(now - DAY_MS);
  const [dayContact] = await db.select({ n: count() }).from(contactMessages).where(and(gt(contactMessages.createdAt, since), byContact));
  const [dayIp] = ip
    ? await db.select({ n: count() }).from(contactMessages).where(and(gt(contactMessages.createdAt, since), eq(contactMessages.ip, ip)))
    : [{ n: 0 }];
  if (dayContact.n >= MAX_PER_DAY_CONTACT || dayIp.n >= MAX_PER_DAY_IP) {
    return { error: "تعداد پیام‌های امروز به سقف رسیده است. لطفاً فردا دوباره تلاش کنید یا تماس بگیرید." };
  }

  const auth = await getAuth();
  const [row] = await db
    .insert(contactMessages)
    .values({
      userId: auth?.user.id ?? null,
      name,
      mobile: id.kind === "mobile" ? id.value : null,
      email: id.kind === "email" ? id.value : null,
      subject,
      message,
      ip,
      userAgent,
    })
    .returning({ id: contactMessages.id });
  await db.insert(events).values({ type: "contact_message", userId: auth?.user.id ?? null, entityType: "contact_message", entityId: row.id, path: "/contact", userAgent });
  return { ok: true };
}
