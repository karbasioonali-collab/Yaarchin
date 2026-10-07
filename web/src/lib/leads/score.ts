import "server-only";
// امتیاز جدیت مشتری (lead scoring). docs/infoyaarchin.md بخش ۲۸.
// - قانون‌ها در جدول lead_score_rules (قابل تنظیم از پنل). امتیاز هر قانون = min(واحد × امتیاز هر واحد، سقف).
// - امتیاز «زنده» و کاملاً داخل Postgres حساب می‌شود (یک کوئری با GROUP BY برای همه‌ی مشتری‌ها). مرتب‌سازی، فیلتر
//   «امتیاز بیشتر از X» و صفحه‌بندی هم همان‌جاست و فقط ردیف‌های همان صفحه به برنامه می‌رسد (RAM پلن ۵۱۲ مگابایتی).
//   محک محلی: ۵٬۰۰۰ مشتری و یک میلیون رویداد ← حدود ۰٫۲ تا ۰٫۳ ثانیه. اگر داده خیلی بزرگ شد: بخش ۲۸ «ستون امتیاز ذخیره‌شده».
// - نوع تازه‌ی قانون: یک case در unitsExpr. داده‌ی بیرونی (AI): نوع signal از customer_signals بدون تغییر کد.
import { asc, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { leadScoreRules } from "@/db/schema";
import { chatReady, followupReady, reportsReady } from "@/lib/db-ready";

export type LeadRule = typeof leadScoreRules.$inferSelect;
export const KIND_FA: Record<string, string> = {
  favorites: "تعداد علاقه‌مندی",
  visit_days: "روزهای بازدید از سایت",
  product_views: "محصول متفاوتِ دیده‌شده",
  profile_complete: "پروفایل کسب‌وکار کامل (۱ واحد)",
  chats: "تعداد گفتگو",
  inquiries: "تعداد درخواست مشتری",
  signal: "نشانه (customer_signals، مثلاً از AI)",
};

export async function loadRules(onlyEnabled = false): Promise<LeadRule[]> {
  if (!(await reportsReady())) return [];
  const all = await db.select().from(leadScoreRules).orderBy(asc(leadScoreRules.sortOrder), asc(leadScoreRules.createdAt));
  return onlyEnabled ? all.filter((r) => r.enabled) : all;
}

// شرط پنجره‌ی زمانی هر قانون روی یک ستون زمان
const win = (col: SQL, days: number | null) => (days ? sql`${col} > now() - make_interval(days => ${days})` : sql`true`);

// تعداد واحدِ یک قانون برای مشتری u (زیرکوئری همبسته؛ هر کدام روی ایندکس user_id/customer_id است)
function unitsExpr(r: LeadRule, ready: { chat: boolean; followup: boolean }): SQL | null {
  const w = r.windowDays;
  switch (r.kind) {
    case "favorites":
      return sql`(select count(*) from favorites f where f.user_id = u.id and ${win(sql`f.created_at`, w)})`;
    case "visit_days":
      return sql`(select count(distinct (e.occurred_at at time zone 'Asia/Tehran')::date) from events e
        where e.user_id = u.id and e.type = 'site_visit' and ${win(sql`e.occurred_at`, w)})`;
    case "product_views":
      return sql`(select count(distinct e.entity_id) from events e where e.user_id = u.id and e.type = 'product_view' and ${win(sql`e.occurred_at`, w)})`;
    case "profile_complete":
      return sql`(select count(*) from customer_profiles p where p.user_id = u.id
        and p.business_type is not null and coalesce(p.city, '') <> '' and p.has_import_experience is not null)`;
    case "chats":
      return ready.chat ? sql`(select count(*) from conversations c where c.customer_id = u.id and ${win(sql`c.created_at`, w)})` : null;
    case "inquiries":
      return ready.followup
        ? sql`(select count(*) from inquiries i join conversations c on c.id = i.conversation_id where c.customer_id = u.id and ${win(sql`i.created_at`, w)})`
        : null;
    case "signal": {
      const key = typeof (r.params as { signal?: unknown })?.signal === "string" ? (r.params as { signal: string }).signal : "";
      return key ? sql`(select coalesce(max(s.value_num), 0) from customer_signals s where s.user_id = u.id and s.key = ${key})` : null;
    }
    default:
      return null; // نوع ناشناخته (مثلاً از نسخه‌ی بعدی کد): امتیاز صفر
  }
}

const num = (v: string | null) => (v === null ? null : Number(v));
function pointsExpr(r: LeadRule, units: SQL): SQL {
  const raw = sql`(${units})::numeric * ${num(r.points)}`;
  return r.cap === null ? raw : sql`least(${raw}, ${num(r.cap)})`;
}

// زیرکوئری «امتیاز همه‌ی مشتری‌ها»: ستون‌های user_id، score و u_<i> (واحد هر قانون فعال)
export async function scoreSource(rules?: LeadRule[]): Promise<{ sql: SQL; rules: LeadRule[] }> {
  const list = rules ?? (await loadRules(true));
  const ready = { chat: await chatReady(), followup: await followupReady() };
  const units = list.map((r) => unitsExpr(r, ready) ?? sql`0`);
  const cols = units.length
    ? sql.join(
        units.map((u, i) => sql`${u} as ${sql.raw(`u_${i}`)}`),
        sql`, `,
      )
    : sql`0 as u_none`;
  const total = units.length
    ? sql.join(
        list.map((r, i) => pointsExpr(r, sql.raw(`x.u_${i}`))),
        sql` + `,
      )
    : sql`0`;
  const inner = sql`select u.id as user_id, ${cols} from users u
    where exists (select 1 from user_roles ur join roles ro on ro.id = ur.role_id where ur.user_id = u.id and ro.key = 'customer')`;
  return { sql: sql`(select x.*, round((${total})::numeric, 1) as score from (${inner}) x)`, rules: list };
}

// امتیاز چند مشتری مشخص (بدون ریز)
export async function scoresFor(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length || !(await reportsReady())) return new Map();
  const { sql: src } = await scoreSource();
  const r = await db.execute<{ user_id: string; score: string }>(
    sql`select user_id, score from ${src} s where s.user_id in (${sql.join(
      ids.map((i) => sql`${i}::uuid`),
      sql`, `,
    )})`,
  );
  return new Map(r.rows.map((x) => [x.user_id, Number(x.score)]));
}

// امتیاز یک مشتری با ریز هر قانون (صفحه‌ی مشتری)
export async function scoreBreakdown(userId: string) {
  if (!(await reportsReady())) return null;
  const { sql: src, rules } = await scoreSource();
  const r = await db.execute<Record<string, string>>(sql`select * from ${src} s where s.user_id = ${userId}::uuid`);
  const row = r.rows[0];
  if (!row) return null;
  const items = rules.map((rule, i) => {
    const units = Number(row[`u_${i}`] ?? 0);
    const raw = units * Number(rule.points);
    const pts = rule.cap === null ? raw : Math.min(raw, Number(rule.cap));
    return { rule, units, points: Math.round(pts * 10) / 10 };
  });
  return { score: Number(row.score), items, max: maxScore(rules) };
}

// بیشترین امتیاز ممکن (اگر همه‌ی قانون‌های فعال سقف دارند)
export function maxScore(rules: LeadRule[]): number | null {
  let m = 0;
  for (const r of rules) {
    if (r.cap !== null) m += Number(r.cap);
    else if (r.kind === "profile_complete") m += Number(r.points);
    else return null;
  }
  return m;
}
