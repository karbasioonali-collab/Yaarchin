"use server";

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { costItems, costItemVersions, currencies, exchangeRates, hsCodes, hsCodeVersions, shippingMethodVersions, taxVersions } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { canAny, requirePermission } from "@/lib/auth/can";
import { requireStaff } from "@/lib/auth/current";
import { num, optStr, str } from "@/lib/catalog/admin-input";
import { ratesReady } from "@/lib/db-ready";
import { validFromInput } from "@/lib/pricing/admin";
import { formulaError } from "@/lib/pricing/formula";
import { fileHash, ImportError, parseHsTable, readTable } from "@/lib/pricing/hs-import";
import { COST_BASES, DUTY_BASES, METHOD_KEYS, VAT_BASES } from "@/lib/pricing/labels";
import { normHs, tehranDate } from "@/lib/pricing/snapshot";

// همه‌ی نوشتنی‌های بخش «نرخ‌ها و هزینه‌ها». قاعده: هیچ ردیف نرخ یا نسخه‌ای ویرایش یا پاک نمی‌شود؛ تغییر = ردیف تازه.
// دسترسی‌ها: rates.enter (نرخ روزانه)، costs.manage (ارز، حمل، هزینه‌ها، مالیات)، hs.manage (HS code). ادمین همیشه.
// همه در لاگ فعالیت ثبت می‌شوند. هر عدد ورودی با ارقام فارسی و «٫» هم پذیرفته می‌شود (admin-input → num).
const NOT_READY = "جدول‌های نرخ هنوز ساخته نشده‌اند؛ در کنسول لیارا npm run db:migrate و بعد npm run db:seed را اجرا کنید.";
const UUID = /^[0-9a-f-]{36}$/i;
const revalidate = () => revalidatePath("/", "layout");

async function activeCurrencyCodes(): Promise<Set<string>> {
  const rows = await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.isActive, true));
  return new Set(rows.map((r) => r.code));
}
const nonNeg = (n: number | null) => n === null || (!Number.isNaN(n) && n >= 0);
const picked = <T extends string>(fd: FormData, name: string, allowed: readonly T[]) =>
  [...new Set(fd.getAll(name).map(String))].filter((x): x is T => (allowed as readonly string[]).includes(x));

// ---------- نرخ ارز (rates.enter) ----------
// یک فرم برای همه‌ی ارزهای فعال: market_USD، customs_USD، … . هر خانه‌ی پرشده یک ردیف تازه در exchange_rates.
export async function addRatesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("rates.enter");
  if (!(await ratesReady())) return { error: NOT_READY };
  const date = str(fd, "rateDate", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "تاریخ نرخ نامعتبر است." };
  if (date > tehranDate()) return { error: "تاریخ نرخ نمی‌تواند بعد از امروز باشد." };
  const curs = await db
    .select()
    .from(currencies)
    .where(and(eq(currencies.isActive, true), eq(currencies.isBase, false)));
  const note = optStr(fd, "note", 500);
  const values: (typeof exchangeRates.$inferInsert)[] = [];
  for (const c of curs) {
    for (const kind of ["market", "customs"] as const) {
      const v = num(fd.get(`${kind}_${c.code}`));
      if (v === null) continue;
      if (Number.isNaN(v) || v <= 0) return { error: `نرخ ${kind === "market" ? "بازار" : "گمرکی"} ${c.nameFa} باید عدد بزرگ‌تر از صفر باشد.` };
      if (v > 1e12) return { error: `نرخ ${c.nameFa} بیش از حد بزرگ است.` };
      values.push({ currencyCode: c.code, kind, rateToman: String(v), rateDate: date, note, createdBy: a.user.id });
    }
  }
  if (!values.length) return { error: "دست‌کم یک نرخ وارد کنید." };
  await db.insert(exchangeRates).values(values);
  await logActivity({
    actorUserId: a.user.id,
    actingAsUserId: a.session.impersonatingUserId,
    action: "rate.add",
    entityType: "exchange_rate",
    after: { date, note, rates: values.map((v) => ({ currency: v.currencyCode, kind: v.kind, toman: Number(v.rateToman) })) },
  });
  revalidate();
  return { ok: `${values.length.toLocaleString("fa-IR")} نرخ ثبت شد. قیمت‌های سایت از همین حالا با نرخ تازه حساب می‌شوند.` };
}

// ---------- ارزها (costs.manage) ----------
export async function addCurrencyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("costs.manage");
  if (!(await ratesReady())) return { error: NOT_READY };
  const code = str(fd, "code", 3).toUpperCase();
  const nameFa = str(fd, "nameFa", 60);
  if (!/^[A-Z]{3}$/.test(code)) return { error: "کد ارز سه حرف انگلیسی است (مثل EUR یا AED)." };
  if (nameFa.length < 2) return { error: "اسم فارسی ارز را وارد کنید." };
  const [dup] = await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, code));
  if (dup) return { error: "این ارز قبلاً اضافه شده است." };
  const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${currencies.sortOrder}), 0)::int + 1` }).from(currencies);
  await db.insert(currencies).values({ code, nameFa, sortOrder: n });
  await logActivity({ actorUserId: a.user.id, action: "currency.create", entityType: "currency", entityId: code, after: { code, nameFa } });
  revalidate();
  return { ok: `${nameFa} اضافه شد. نرخش را در فرم «ثبت نرخ» وارد کنید.` };
}

export async function toggleCurrencyAction(fd: FormData): Promise<void> {
  const a = await requirePermission("costs.manage");
  const code = str(fd, "code", 3);
  const [c] = await db.select().from(currencies).where(eq(currencies.code, code));
  if (!c || c.isBase) return;
  await db.update(currencies).set({ isActive: !c.isActive }).where(eq(currencies.code, code));
  await logActivity({
    actorUserId: a.user.id,
    action: "currency.toggle",
    entityType: "currency",
    entityId: code,
    before: { isActive: c.isActive },
    after: { isActive: !c.isActive },
  });
  revalidate();
}

// ---------- روش‌های حمل (costs.manage) ----------
export async function addShippingVersionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("costs.manage");
  if (!(await ratesReady())) return { error: NOT_READY };
  const methodKey = str(fd, "methodKey", 10);
  if (!(METHOD_KEYS as readonly string[]).includes(methodKey)) return { error: "روش حمل نامعتبر است." };
  const isActive = fd.get("isActive") === "on";
  const v = {
    ratePerKg: num(fd.get("ratePerKg")),
    ratePerCbm: num(fd.get("ratePerCbm")),
    volumetricFactor: num(fd.get("volumetricFactor")),
    minCharge: num(fd.get("minCharge")),
  };
  const tMin = num(fd.get("transitMinDays"));
  const tMax = num(fd.get("transitMaxDays"));
  const currency = str(fd, "currency", 3);
  if (!Object.values(v).every(nonNeg)) return { error: "نرخ‌ها و حداقل هزینه باید عدد صفر یا بزرگ‌تر باشند (یا خالی)." };
  if (v.volumetricFactor === 0) return { error: "ضریب وزن حجمی باید بزرگ‌تر از صفر باشد (یا خالی)." };
  for (const d of [tMin, tMax]) if (d !== null && (!Number.isInteger(d) || d < 1 || d > 365)) return { error: "زمان رسیدن باید عدد صحیح بین ۱ و ۳۶۵ روز باشد." };
  if (tMin !== null && tMax !== null && tMin > tMax) return { error: "حداقل روز نباید بیشتر از حداکثر باشد." };
  if (tMin === null && tMax !== null) return { error: "حداقل روز رسیدن را هم وارد کنید." };
  if (!(await activeCurrencyCodes()).has(currency)) return { error: "ارز نامعتبر یا غیرفعال است." };
  if (isActive && v.ratePerKg === null && v.ratePerCbm === null) return { error: "روش فعال دست‌کم «نرخ هر کیلو» یا «نرخ هر متر مکعب» لازم دارد." };
  if (isActive && tMin === null) return { error: "برای روش فعال، زمان تقریبی رسیدن را وارد کنید." };
  const vf = validFromInput(str(fd, "validFrom", 16));
  if ("error" in vf) return vf;
  const row = {
    methodKey,
    isActive,
    ratePerKg: v.ratePerKg === null ? null : String(v.ratePerKg),
    ratePerCbm: v.ratePerCbm === null ? null : String(v.ratePerCbm),
    volumetricFactor: v.volumetricFactor === null ? null : String(v.volumetricFactor),
    minCharge: v.minCharge === null ? null : String(v.minCharge),
    currencyCode: currency,
    transitMinDays: tMin,
    transitMaxDays: tMax ?? tMin,
    validFrom: vf.at,
    note: optStr(fd, "note", 500),
    createdBy: a.user.id,
  };
  const [ins] = await db.insert(shippingMethodVersions).values(row).returning({ id: shippingMethodVersions.id });
  await logActivity({
    actorUserId: a.user.id,
    action: "shipping.version",
    entityType: "shipping_method",
    entityId: methodKey,
    after: { versionId: ins.id, ...row, createdBy: undefined },
  });
  revalidate();
  return { ok: "نسخه‌ی تازه ثبت شد." };
}

// ---------- بیمه و هزینه‌های دیگر (costs.manage) ----------
type CostVersionInput = Omit<typeof costItemVersions.$inferInsert, "itemId" | "createdBy">;

async function readCostVersion(fd: FormData): Promise<{ error: string } | { v: CostVersionInput }> {
  const calcType = String(fd.get("calcType") ?? "");
  if (!["fixed", "percent", "per_kg", "per_cbm", "formula"].includes(calcType)) return { error: "نوع محاسبه را انتخاب کنید." };
  const amount = num(fd.get("amount"));
  const formula = str(fd, "formula", 500);
  const currency = str(fd, "currency", 3) || null;
  const percentBase = picked(fd, "percentBase", COST_BASES);
  const methodsPicked = picked(fd, "methods", METHOD_KEYS);
  if (!methodsPicked.length) return { error: "دست‌کم یک روش حمل را انتخاب کنید (آیتم برای کدام روش‌ها حساب شود)." };
  const methods = methodsPicked.length === METHOD_KEYS.length ? null : methodsPicked;
  if (calcType === "formula") {
    const e = formulaError(formula);
    if (e) return { error: `فرمول: ${e}` };
  } else {
    if (amount === null || Number.isNaN(amount) || amount < 0)
      return { error: calcType === "percent" ? "درصد را وارد کنید (عدد صفر یا بزرگ‌تر)." : "مبلغ را وارد کنید (عدد صفر یا بزرگ‌تر)." };
    if (calcType === "percent" && amount > 1000) return { error: "درصد بیش از حد بزرگ است." };
  }
  if (calcType === "percent" && !percentBase.length) return { error: "پایه‌ی درصد را انتخاب کنید (ارزش کالا و/یا هزینه‌ی حمل)." };
  if (calcType !== "percent" && (!currency || !(await activeCurrencyCodes()).has(currency))) return { error: "ارز آیتم را انتخاب کنید." };
  const vf = validFromInput(str(fd, "validFrom", 16));
  if ("error" in vf) return vf;
  return {
    v: {
      isActive: fd.get("isActive") === "on",
      calcType: calcType as CostVersionInput["calcType"],
      amount: calcType === "formula" || amount === null ? null : String(amount),
      percentBase: calcType === "percent" ? percentBase : null,
      formula: calcType === "formula" ? formula : null,
      currencyCode: calcType === "percent" ? null : currency,
      methods,
      validFrom: vf.at,
      note: optStr(fd, "note", 500),
    },
  };
}

export async function createCostItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("costs.manage");
  if (!(await ratesReady())) return { error: NOT_READY };
  const nameFa = str(fd, "nameFa", 100);
  if (nameFa.length < 2) return { error: "اسم آیتم را وارد کنید (مثل «بیمه» یا «ترخیص»)." };
  const r = await readCostVersion(fd);
  if ("error" in r) return r;
  const id = await db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(${costItems.sortOrder}), 0)::int + 1` }).from(costItems);
    const [item] = await tx.insert(costItems).values({ nameFa, sortOrder: n, createdBy: a.user.id }).returning({ id: costItems.id });
    await tx.insert(costItemVersions).values({ ...r.v, itemId: item.id, createdBy: a.user.id });
    return item.id;
  });
  await logActivity({ actorUserId: a.user.id, action: "cost_item.create", entityType: "cost_item", entityId: id, after: { nameFa, ...r.v } });
  revalidate();
  redirect(`/admin/rates/costs/${id}`);
}

export async function addCostVersionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("costs.manage");
  if (!(await ratesReady())) return { error: NOT_READY };
  const itemId = str(fd, "itemId", 40);
  if (!UUID.test(itemId)) return { error: "آیتم نامعتبر است." };
  const [item] = await db.select({ nameFa: costItems.nameFa }).from(costItems).where(eq(costItems.id, itemId));
  if (!item) return { error: "آیتم پیدا نشد." };
  const r = await readCostVersion(fd);
  if ("error" in r) return r;
  const [ins] = await db
    .insert(costItemVersions)
    .values({ ...r.v, itemId, createdBy: a.user.id })
    .returning({ id: costItemVersions.id });
  await logActivity({ actorUserId: a.user.id, action: "cost_item.version", entityType: "cost_item", entityId: itemId, after: { versionId: ins.id, nameFa: item.nameFa, ...r.v } });
  revalidate();
  return { ok: "نسخه‌ی تازه ثبت شد." };
}

export async function renameCostItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("costs.manage");
  const itemId = str(fd, "itemId", 40);
  const nameFa = str(fd, "nameFa", 100);
  if (!UUID.test(itemId)) return { error: "آیتم نامعتبر است." };
  if (nameFa.length < 2) return { error: "اسم آیتم را وارد کنید." };
  const [item] = await db.select({ nameFa: costItems.nameFa }).from(costItems).where(eq(costItems.id, itemId));
  if (!item) return { error: "آیتم پیدا نشد." };
  if (item.nameFa === nameFa) return { ok: "بدون تغییر." };
  await db.update(costItems).set({ nameFa }).where(eq(costItems.id, itemId));
  await logActivity({ actorUserId: a.user.id, action: "cost_item.rename", entityType: "cost_item", entityId: itemId, before: { nameFa: item.nameFa }, after: { nameFa } });
  revalidate();
  return { ok: "اسم ذخیره شد." };
}

// ---------- مالیات ارزش افزوده و نرخ گمرکی (costs.manage) ----------
export async function addTaxVersionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("costs.manage");
  if (!(await ratesReady())) return { error: NOT_READY };
  const vatPercent = num(fd.get("vatPercent"));
  if (vatPercent === null || Number.isNaN(vatPercent) || vatPercent < 0 || vatPercent > 100) return { error: "درصد ارزش افزوده باید عددی بین ۰ و ۱۰۰ باشد." };
  const vatBase = picked(fd, "vatBase", VAT_BASES);
  if (!vatBase.length) return { error: "پایه‌ی ارزش افزوده را انتخاب کنید." };
  const customsRateFor = picked(fd, "customsRateFor", ["duty", "vat"] as const);
  const vf = validFromInput(str(fd, "validFrom", 16));
  if ("error" in vf) return vf;
  const row = { vatPercent: String(vatPercent), vatBase, customsRateFor, validFrom: vf.at, note: optStr(fd, "note", 500), createdBy: a.user.id };
  const [ins] = await db.insert(taxVersions).values(row).returning({ id: taxVersions.id });
  await logActivity({
    actorUserId: a.user.id,
    action: "tax.version",
    entityType: "tax",
    entityId: String(ins.id),
    after: { vatPercent, vatBase, customsRateFor, validFrom: vf.at, note: row.note },
  });
  revalidate();
  return { ok: "نسخه‌ی تازه ثبت شد." };
}

// ---------- HS code (hs.manage) ----------
type HsInput = Omit<typeof hsCodeVersions.$inferInsert, "code" | "createdBy">;

async function readHs(fd: FormData): Promise<{ error: string } | { code: string; v: HsInput }> {
  const code = normHs(str(fd, "code", 30));
  if (!code) return { error: "HS code باید ۴ تا ۱۲ رقم باشد (نقطه و فاصله مهم نیست)." };
  const dutyType = String(fd.get("dutyType") ?? "");
  if (dutyType !== "percent" && dutyType !== "fixed") return { error: "نوع حقوق ورودی را انتخاب کنید." };
  const value = num(fd.get("dutyValue"));
  if (value === null || Number.isNaN(value) || value < 0) return { error: "مقدار حقوق ورودی را وارد کنید (عدد صفر یا بزرگ‌تر)." };
  if (dutyType === "percent" && value > 1000) return { error: "درصد بیش از حد بزرگ است." };
  const base = picked(fd, "dutyBase", DUTY_BASES);
  if (dutyType === "percent" && !base.length) return { error: "پایه‌ی محاسبه‌ی حقوق ورودی را انتخاب کنید." };
  const currency = str(fd, "dutyCurrency", 3) || "IRT";
  const per = String(fd.get("fixedPer") ?? "unit");
  if (dutyType === "fixed") {
    if (!(await activeCurrencyCodes()).has(currency)) return { error: "ارز مبلغ ثابت نامعتبر است." };
    if (!["unit", "kg", "shipment"].includes(per)) return { error: "«به ازای» نامعتبر است." };
  }
  const vf = validFromInput(str(fd, "validFrom", 16));
  if ("error" in vf) return vf;
  return {
    code,
    v: {
      titleFa: optStr(fd, "titleFa", 500),
      isActive: fd.get("isActive") === "on",
      dutyType,
      dutyValue: String(value),
      dutyBase: dutyType === "percent" ? base : null,
      dutyCurrency: dutyType === "fixed" ? currency : null,
      fixedPer: dutyType === "fixed" ? (per as HsInput["fixedPer"]) : null,
      validFrom: vf.at,
      note: optStr(fd, "note", 500),
    },
  };
}

export async function saveHsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("hs.manage");
  if (!(await ratesReady())) return { error: NOT_READY };
  const r = await readHs(fd);
  if ("error" in r) return r;
  const isNew = await db.transaction(async (tx) => {
    const created = await tx.insert(hsCodes).values({ code: r.code }).onConflictDoNothing().returning({ code: hsCodes.code });
    await tx.insert(hsCodeVersions).values({ ...r.v, code: r.code, createdBy: a.user.id });
    return created.length > 0;
  });
  await logActivity({ actorUserId: a.user.id, action: isNew ? "hs.create" : "hs.version", entityType: "hs_code", entityId: r.code, after: r.v });
  revalidate();
  if (fd.get("redirect") === "detail") redirect(`/admin/rates/hs/${r.code}`);
  return { ok: isNew ? `کد ${r.code} به لیست اضافه شد. محصول‌هایی که همین کد را دارند خودکار وصل شدند.` : `نسخه‌ی تازه‌ی کد ${r.code} ثبت شد.` };
}

// ورود فایل: دکمه‌ی «پیش‌نمایش» (step=preview) فایل را می‌خواند و گزارش می‌دهد، بدون ثبت. دکمه‌ی «ثبت» (step=commit)
// همان فایل را دوباره می‌فرستد؛ سرور دوباره همه‌چیز را بررسی می‌کند و فقط اگر هش فایل با پیش‌نمایش یکی باشد ثبت می‌کند.
// کد بدون تغییر نسخه‌ی تازه نمی‌گیرد؛ کدی که در فایل نیست دست نمی‌خورد (پاک نمی‌شود).
export type HsImportState = {
  error?: string;
  ok?: string;
  preview?: {
    hash: string;
    fileName: string;
    total: number;
    fresh: number;
    changed: number;
    same: number;
    notInFile: number;
    errors: { line: number; message: string }[];
    sample: { line: number; code: string; titleFa: string | null; duty: string; status: "new" | "changed" | "same" }[];
  };
} | null;

type Current = {
  title_fa: string | null;
  is_active: boolean;
  duty_type: string;
  duty_value: string;
  duty_base: string[] | null;
  duty_currency: string | null;
  fixed_per: string | null;
};

export async function importHsAction(_prev: HsImportState, fd: FormData): Promise<HsImportState> {
  const a = await requirePermission("hs.manage");
  if (!(await ratesReady())) return { error: NOT_READY };
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "فایل را انتخاب کنید." };
  const step = fd.get("step") === "commit" ? "commit" : "preview";
  const buf = Buffer.from(await file.arrayBuffer());
  const hash = fileHash(buf);
  let parsed;
  try {
    const allCurrencies = new Set((await db.select({ code: currencies.code }).from(currencies)).map((c) => c.code));
    parsed = parseHsTable(readTable(file.name, buf), allCurrencies);
  } catch (e) {
    if (e instanceof ImportError) return { error: e.message };
    return { error: "فایل خوانده نشد. آن را با اکسل به‌صورت .xlsx یا CSV (UTF-8) ذخیره کنید." };
  }
  if (!parsed.rows.length && !parsed.errors.length) return { error: "فایل ردیفی ندارد." };

  // مقایسه با نسخه‌ی فعلی هر کد
  const cur = await db.execute<Current & { code: string }>(sql`
    select distinct on (code) code, title_fa, is_active, duty_type, duty_value, duty_base, duty_currency, fixed_per
    from hs_code_versions where valid_from <= now() order by code, valid_from desc, id desc`);
  const current = new Map(cur.rows.map((r) => [r.code, r]));
  const same = (r: (typeof parsed.rows)[number], c: Current | undefined) =>
    !!c &&
    c.title_fa === r.titleFa &&
    c.is_active === r.isActive &&
    c.duty_type === r.dutyType &&
    Number(c.duty_value) === r.dutyValue &&
    JSON.stringify([...(c.duty_base ?? [])].sort()) === JSON.stringify([...(r.dutyBase ?? [])].sort()) &&
    (c.duty_currency ?? null) === r.dutyCurrency &&
    (c.fixed_per ?? null) === r.fixedPer;
  const status = (r: (typeof parsed.rows)[number]) => (!current.has(r.code) ? "new" : same(r, current.get(r.code)) ? "same" : "changed");
  const inFile = new Set(parsed.rows.map((r) => r.code));
  const counts = { fresh: 0, changed: 0, same: 0 };
  for (const r of parsed.rows) {
    const s = status(r);
    counts[s === "new" ? "fresh" : s]++;
  }

  const preview: NonNullable<HsImportState>["preview"] = {
    hash,
    fileName: file.name,
    total: parsed.rows.length,
    ...counts,
    notInFile: [...current.keys()].filter((c) => !inFile.has(c)).length,
    errors: parsed.errors.slice(0, 200),
    sample: parsed.rows.slice(0, 100).map((r) => ({
      line: r.line,
      code: r.code,
      titleFa: r.titleFa,
      duty: r.dutyType === "percent" ? `${r.dutyValue.toLocaleString("fa-IR")}٪` : `${r.dutyValue.toLocaleString("fa-IR")} ${r.dutyCurrency} (${r.fixedPer})`,
      status: status(r),
    })),
  };
  if (step === "preview") return { preview };
  // ثبت رد شد ← پیش‌نمایش (همین فایل) می‌ماند تا کاربر ببیند چه چیزی ثبت می‌شود
  if (fd.get("hash") !== hash) return { error: "فایل با پیش‌نمایش قبلی یکی نیست؛ پیش‌نمایش همین فایل را ببینید و دوباره «ثبت» بزنید.", preview };
  if (parsed.errors.length && fd.get("ignoreErrors") !== "on")
    return { error: "فایل ردیف خطادار دارد؛ یا فایل را درست کنید یا تیک «ردیف‌های خطادار نادیده گرفته شوند» را بزنید.", preview };
  const toWrite = parsed.rows.filter((r) => status(r) !== "same");
  if (!toWrite.length) return { ok: "همه‌ی کدهای فایل با لیست فعلی یکسان‌اند؛ چیزی ثبت نشد." };
  const batch = randomUUID();
  const validFrom = new Date();
  await db.transaction(async (tx) => {
    for (let i = 0; i < toWrite.length; i += 1000) {
      const chunk = toWrite.slice(i, i + 1000);
      await tx
        .insert(hsCodes)
        .values(chunk.map((r) => ({ code: r.code, source: "import" })))
        .onConflictDoNothing();
      await tx.insert(hsCodeVersions).values(
        chunk.map((r) => ({
          code: r.code,
          titleFa: r.titleFa,
          isActive: r.isActive,
          dutyType: r.dutyType,
          dutyValue: String(r.dutyValue),
          dutyBase: r.dutyBase,
          dutyCurrency: r.dutyCurrency,
          fixedPer: r.fixedPer,
          validFrom,
          importBatch: batch,
          note: `ورود فایل ${file.name.slice(0, 100)}`,
          source: "import",
          createdBy: a.user.id,
        })),
      );
    }
  });
  await logActivity({
    actorUserId: a.user.id,
    action: "hs.import",
    entityType: "hs_code",
    entityId: batch,
    after: { fileName: file.name, hash, written: toWrite.length, ...counts, skippedErrors: parsed.errors.length },
  });
  revalidate();
  return {
    ok: `ثبت شد: ${counts.fresh.toLocaleString("fa-IR")} کد تازه و ${counts.changed.toLocaleString("fa-IR")} کد تغییرکرده (نسخه‌ی تازه). ${counts.same.toLocaleString("fa-IR")} کد بدون تغییر بود.`,
  };
}

// جستجوی HS برای فرم محصول (products.manage یا hs.manage). حداکثر ۱۵ نتیجه.
export async function searchHsAction(q: string): Promise<{ code: string; titleFa: string | null; duty: string }[]> {
  const a = await requireStaff();
  if (!(await canAny(a.user, ["products.manage", "hs.manage"])) || !(await ratesReady())) return [];
  const text = String(q ?? "")
    .trim()
    .slice(0, 60);
  if (text.length < 2) return [];
  const digits = normHs(text) ?? (/^[\d.\s]+$/.test(text) ? text.replace(/\D/g, "") : null);
  const r = await db.execute<{ code: string; title_fa: string | null; duty_type: string; duty_value: string; duty_currency: string | null; fixed_per: string | null }>(sql`
    select * from (
      select distinct on (code) code, title_fa, is_active, duty_type, duty_value, duty_currency, fixed_per
      from hs_code_versions where valid_from <= now() order by code, valid_from desc, id desc
    ) v where v.is_active and ${digits ? sql`v.code like ${digits + "%"}` : sql`v.title_fa ilike ${"%" + text + "%"}`}
    order by v.code limit 15`);
  return r.rows.map((x) => ({
    code: x.code,
    titleFa: x.title_fa,
    duty: x.duty_type === "percent" ? `${Number(x.duty_value).toLocaleString("fa-IR")}٪` : `${Number(x.duty_value).toLocaleString("fa-IR")} ${x.duty_currency ?? ""}`,
  }));
}
