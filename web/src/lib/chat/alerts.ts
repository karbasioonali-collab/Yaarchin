import "server-only";
// هشدار پیامکی گفتگوها (از همان sendSms؛ بدون سرویس‌دهنده = حالت آزمایشی، فقط در پنل «پیامک‌های ارسالی»).
//   ۱) گفتگوی تازه‌ی ارجاع‌نشده  ← به ادمین‌ها و هر کس chats.assign دارد
//   ۲) ارجاع گفتگو به کارشناس    ← به همان کارشناس
//   ۳) پیام مشتری X دقیقه بی‌پاسخ در گفتگوی یک کارشناس ← یادآوری به همان کارشناس (زمان‌بند، lib/chat/scheduler.ts)
// محدودیت‌ها (همه از پنل ← گفتگوها ← تنظیمات):
//   - برای هر گفتگو و هر گیرنده در بازه‌ی sms.chat_cooldown_minutes حداکثر یک پیامک
//   - فقط در ساعت و روزهای کاری (sms.work_start، sms.work_end، sms.work_days؛ ساعت تهران)؛ خارج از آن فرستاده نمی‌شود
//     (هشدار ۱ و ۲ با وضعیت skipped ثبت می‌شود؛ یادآوری ۳ اصلاً بررسی نمی‌شود تا ساعت کاری شروع شود)
//   - هر کارمند می‌تواند پیامک را برای خودش خاموش کند (staff_notification_prefs، صفحه‌ی «حساب من» پنل)
//   - کارمند بدون موبایل پیامک نمی‌گیرد
// docs/infoyaarchin.md بخش ۲۵.
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { followupReady } from "@/lib/db-ready";
import { getSetting } from "@/lib/settings";
import { recordSkippedSms, sendSms } from "@/lib/sms";

export type SmsRules = { cooldownMin: number; reminderMin: number; workStart: string; workEnd: string; workDays: number[] };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export async function smsRules(): Promise<SmsRules> {
  const [c, r, s, e, d] = await Promise.all([
    getSetting<number>("sms.chat_cooldown_minutes"),
    getSetting<number>("sms.reminder_minutes"),
    getSetting<string>("sms.work_start"),
    getSetting<string>("sms.work_end"),
    getSetting<number[]>("sms.work_days"),
  ]);
  return {
    cooldownMin: Number(c) > 0 ? Number(c) : 30,
    reminderMin: Number(r) > 0 ? Number(r) : 15,
    workStart: HHMM.test(String(s)) ? String(s) : "09:00",
    workEnd: HHMM.test(String(e)) ? String(e) : "18:00",
    workDays: Array.isArray(d) ? d.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : [6, 0, 1, 2, 3, 4],
  };
}

// روز هفته (۰ یکشنبه … ۶ شنبه) و ساعت به وقت تهران
const tehranParts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const DAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function inWorkHours(rules: SmsRules, at = new Date()): boolean {
  const p = Object.fromEntries(tehranParts.formatToParts(at).map((x) => [x.type, x.value]));
  const day = DAYS[p.weekday];
  const hm = `${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
  if (!rules.workDays.includes(day)) return false;
  // بازه‌ای که از نیمه‌شب رد می‌شود (مثلاً ۲۲:۰۰ تا ۰۶:۰۰) هم پشتیبانی می‌شود
  return rules.workStart <= rules.workEnd ? hm >= rules.workStart && hm < rules.workEnd : hm >= rules.workStart || hm < rules.workEnd;
}

type Recipient = { id: string; fullName: string; mobile: string };

// کارمند فعال با موبایل که پیامک را برای خودش خاموش نکرده؛ perm = null یعنی هر کارمند (برای ارجاع/یادآوری به خود کارشناس)
async function recipients(opts: { perm: string | null; userId?: string }): Promise<Recipient[]> {
  const enforce = (await getSetting<boolean>("auth.enforce_permissions")) === true;
  const r = await db.execute<{ id: string; full_name: string; mobile: string }>(sql`
    select u.id, u.full_name, u.mobile from users u
    where u.status = 'active' and u.mobile is not null
      ${opts.userId ? sql`and u.id = ${opts.userId}` : sql``}
      and not exists (select 1 from staff_notification_prefs p where p.user_id = u.id and not p.sms_enabled)
      and exists (select 1 from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = u.id and r.is_staff
        and (r.key = 'admin' or ${!enforce} or ${opts.perm === null}
             or exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission_key = ${opts.perm ?? ""})))`);
  return r.rows.map((x) => ({ id: x.id, fullName: x.full_name, mobile: x.mobile }));
}

async function recentlySent(conversationId: string, userId: string, minutes: number): Promise<boolean> {
  const r = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from sms_outbox where conversation_id = ${conversationId} and user_id = ${userId}
      and status in ('test', 'sent') and created_at > now() - make_interval(mins => ${minutes})`);
  return (r.rows[0]?.n ?? 0) > 0;
}

async function deliver(to: Recipient, text: string, kind: string, conversationId: string, rules: SmsRules, checkHours = true) {
  if (await recentlySent(conversationId, to.id, rules.cooldownMin)) return "cooldown" as const;
  const meta = { kind, userId: to.id, conversationId };
  if (checkHours && !inWorkHours(rules)) {
    await recordSkippedSms(to.mobile, text, meta, "خارج از ساعت کاری");
    return "skipped" as const;
  }
  await sendSms(to.mobile, text, meta);
  return "sent" as const;
}

const withLink = (text: string, link: string | null) => (link ? `${text}\n${link}` : text);

// ۱) گفتگوی تازه‌ی ارجاع‌نشده (یا گفتگوی بازشده‌ای که به صف برگشت)
export async function alertNewChat(c: { conversationId: string; customerName: string; topic: string | null; link: string | null }): Promise<void> {
  if (!(await followupReady())) return;
  const rules = await smsRules();
  const text = withLink(`یارچین: گفتگوی تازه‌ی ارجاع‌نشده از ${c.customerName}${c.topic ? ` درباره‌ی «${c.topic.slice(0, 40)}»` : ""}.`, c.link);
  for (const to of await recipients({ perm: "chats.assign" })) await deliver(to, text, "chat_new", c.conversationId, rules);
}

// ۲) ارجاع به کارشناس (اگر خودش به خودش ارجاع داده، پیامک لازم نیست)
export async function alertAssigned(c: { conversationId: string; expertId: string; byId: string; customerName: string; link: string | null }): Promise<void> {
  if (!(await followupReady()) || c.expertId === c.byId) return;
  const rules = await smsRules();
  const text = withLink(`یارچین: گفتگوی ${c.customerName} به شما ارجاع شد.`, c.link);
  for (const to of await recipients({ perm: null, userId: c.expertId })) await deliver(to, text, "chat_assigned", c.conversationId, rules);
}

// ۳) یادآوری پیام بی‌پاسخ (زمان‌بند هر دقیقه). فقط در ساعت کاری؛ برای هر «نوبت بی‌پاسخ» یک یادآوری (بعد از آخرین پیام مشتری)،
// و همچنان محدود به cooldown هر گفتگو.
export async function runReminders(link: (conversationId: string) => string | null): Promise<number> {
  if (!(await followupReady())) return 0;
  const rules = await smsRules();
  if (!inWorkHours(rules)) return 0;
  const due = await db.execute<{ id: string; assigned_to: string; customer_name: string }>(sql`
    select c.id, c.assigned_to, u.full_name as customer_name
    from conversations c join users u on u.id = c.customer_id
    where c.status = 'open' and c.assigned_to is not null and c.last_customer_message_at is not null
      and c.last_customer_message_at <= now() - make_interval(mins => ${rules.reminderMin})
      and not exists (select 1 from chat_messages m where m.conversation_id = c.id and m.sender_type in ('staff', 'ai') and m.created_at > c.last_customer_message_at)
      and not exists (select 1 from sms_outbox o where o.conversation_id = c.id and o.user_id = c.assigned_to and o.kind = 'chat_reminder'
                      and o.created_at > c.last_customer_message_at)
    limit 50`);
  let n = 0;
  for (const c of due.rows) {
    const text = withLink(`یارچین: پیام ${c.customer_name} در گفتگوی شما بیش از ${rules.reminderMin.toLocaleString("fa-IR")} دقیقه بی‌پاسخ مانده.`, link(c.id));
    for (const to of await recipients({ perm: null, userId: c.assigned_to })) if ((await deliver(to, text, "chat_reminder", c.id, rules, false)) === "sent") n++;
  }
  return n;
}
