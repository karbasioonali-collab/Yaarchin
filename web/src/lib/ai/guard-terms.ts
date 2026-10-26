import "server-only";
// لیست سیاه محافظ خروجی: کلمه‌های پنل (تنظیم ai.blacklist) + خودکار از دیتابیس: اسم همه‌ی کارخانه‌ها (انگلیسی و بدون پسوند
// Co., Ltd و …)، شناسه‌های بیرونی‌شان (فروشگاه علی‌بابا و …) و نام، ایمیل و تلفن تماس‌هایشان. ۶۰ ثانیه در حافظه می‌ماند.
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getSetting } from "@/lib/settings";

let cache: { at: number; terms: string[] } | null = null;
const SUFFIX =
  /\b(co\.?\s*,?\s*ltd\.?|company\s+limited|ltd\.?|limited|inc\.?|llc|corp\.?|corporation|factory|manufactur\w*|trading|industr(?:y|ial|ies)|technology|technologies|tech|group|international|import\s*&?\s*export)\b/gi;

export async function blacklistTerms(): Promise<string[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.terms;
  const manual = ((await getSetting<string[]>("ai.blacklist")) ?? []).filter((x) => typeof x === "string");
  const r = await db
    .execute<{ t: string | null }>(
      sql`
    select name_en as t from companies union select name_fa from companies union select website from companies
    union select external_id from company_external_ids
    union select name from company_contacts union select email from company_contacts union select phone from company_contacts
    union select wechat from company_contacts union select whatsapp from company_contacts`,
    )
    .catch(async () => db.execute<{ t: string | null }>(sql`select name_en as t from companies`));
  const auto = new Set<string>();
  for (const { t } of r.rows) {
    if (!t) continue;
    const s = t.trim();
    if (s.length >= 3) auto.add(s);
    const core = s
      .replace(SUFFIX, " ")
      .replace(/[,.()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (core.length >= 5 && core !== s) auto.add(core);
  }
  const terms = [...new Set([...manual.map((x) => x.trim()).filter(Boolean), ...auto])];
  cache = { at: Date.now(), terms };
  return terms;
}

export function clearBlacklistCache() {
  cache = null;
}
