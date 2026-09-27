// خلاصه‌ی یک نسخه‌ی «بیمه و هزینه‌ها» برای نمایش در پنل (بدون server-only)
import { BASE_FA, CALC_TYPE_FA, FIXED_PER_FA, METHOD_FA } from "./labels";

export type CostVersionLike = {
  calcType: string;
  amount: string | null;
  percentBase: string[] | null;
  formula: string | null;
  currencyCode: string | null;
  methods: string[] | null;
};

const n = (v: string | null) => Number(v ?? 0).toLocaleString("fa-IR", { maximumFractionDigits: 4 });

export function costText(v: CostVersionLike, curName: (code: string) => string): string {
  const cur = v.currencyCode ? curName(v.currencyCode) : "";
  const main =
    v.calcType === "percent"
      ? `${n(v.amount)}٪ از ${(v.percentBase ?? []).map((b) => BASE_FA[b]).join(" + ")}`
      : v.calcType === "fixed"
        ? `${n(v.amount)} ${cur} برای کل سفارش`
        : v.calcType === "per_kg"
          ? `${n(v.amount)} ${cur} هر کیلو`
          : v.calcType === "per_cbm"
            ? `${n(v.amount)} ${cur} هر متر مکعب`
            : `فرمول: ${v.formula} (${cur})`;
  const methods = v.methods ? `فقط ${v.methods.map((m) => METHOD_FA[m]).join("، ")}` : "همه‌ی روش‌ها";
  return `${main} · ${methods}`;
}

export const calcTypeFa = (t: string) => CALC_TYPE_FA[t] ?? t;

// ردیف HS با نسخه‌ی فعلی (پنل)
export type HsRow = {
  code: string;
  title_fa: string | null;
  is_active: boolean;
  duty_type: string;
  duty_value: string;
  duty_base: string[] | null;
  duty_currency: string | null;
  fixed_per: string | null;
  valid_from: Date;
  products: number;
};

export function dutyText(r: Pick<HsRow, "duty_type" | "duty_value" | "duty_base" | "duty_currency" | "fixed_per">, curName: (c: string) => string) {
  return r.duty_type === "percent"
    ? `${n(r.duty_value)}٪ از ${(r.duty_base ?? ["goods", "shipping", "costs"]).map((b) => BASE_FA[b]).join(" + ")}`
    : `${n(r.duty_value)} ${curName(r.duty_currency ?? "IRT")} ${FIXED_PER_FA[r.fixed_per ?? "unit"]}`;
}
