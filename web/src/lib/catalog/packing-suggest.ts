// «پیشنهاد از مشخصات» برای خانه‌های خالی بسته‌بندی صفحه‌ی محصول (بخش ۴۱). خالص؛ تست واحد مستقیم اجرایش می‌کند.
// منبع هر لیستینگ: meta.packing (لیستینگ واردشده از علی‌بابا، با اصلاح‌های صفحه‌ی بررسی مثل انتخاب «Quantity») یا
// خواندن specs.attributes با همان packingFromAttributes خواننده. هیچ‌چیز خودکار پر نمی‌شود؛ پنل دکمه‌ی «استفاده» دارد.
import { packingFromAttributes } from "../import/alibaba/parse";
import { estimateCarton, type Packing } from "../import/alibaba/values";

export type ListingPackingSource = { label: string; meta: unknown; specs: unknown };
export type ProductPacking = {
  unitWeightKg: number | null;
  unitsPerCarton: number | null;
  cartonWeightKg: number | null;
  cartonLengthCm: number | null;
  cartonWidthCm: number | null;
  cartonHeightCm: number | null;
};
// fields: نام خانه‌های فرم ← مقدار (برای «استفاده»)
export type Suggestion = {
  key: "unitWeightKg" | "unitsPerCarton" | "cartonWeightKg" | "cartonDims";
  text: string;
  fields: Record<string, string>;
  estimated: boolean;
  sources: string[];
};
export type UnitDimsInfo = { text: string; sources: string[] };

const s = (n: number) => String(Math.round(n * 1000) / 1000);
const isDims = (d: unknown): d is { l: number; w: number; h: number } =>
  !!d && typeof d === "object" && ["l", "w", "h"].every((k) => typeof (d as Record<string, unknown>)[k] === "number");

function packingOf(src: ListingPackingSource): Omit<Packing, "estimated"> {
  const m = (src.meta as { packing?: Partial<Packing> } | null)?.packing;
  const num = (x: unknown) => (typeof x === "number" && x > 0 ? x : null);
  const fromAttrs = packingFromAttributes(((src.specs as { attributes?: unknown } | null)?.attributes as { name: string; value: string }[]) ?? []);
  // meta.packing (ورود از علی‌بابا) اول؛ هر خانه‌ی خالی‌اش از مشخصات
  return {
    unitWeightKg: num(m?.unitWeightKg) ?? fromAttrs.unitWeightKg,
    unitDimsCm: isDims(m?.unitDimsCm) ? m!.unitDimsCm! : fromAttrs.unitDimsCm,
    unitsPerCarton: num(m?.unitsPerCarton) ?? fromAttrs.unitsPerCarton,
    // کارتنِ تخمینیِ meta حساب نمی‌شود؛ دوباره از مقدارهای واقعی تخمین زده می‌شود
    cartonDimsCm: isDims(m?.cartonDimsCm) && !m?.estimated?.cartonDimsCm ? m!.cartonDimsCm! : fromAttrs.cartonDimsCm,
    cartonWeightKg: (m?.estimated?.cartonWeightKg ? null : num(m?.cartonWeightKg)) ?? fromAttrs.cartonWeightKg,
  };
}

export function suggestPacking(listings: ListingPackingSource[], current: ProductPacking): { suggestions: Suggestion[]; unitDims: UnitDimsInfo[] } {
  const out = new Map<string, Suggestion>();
  const unitDims = new Map<string, UnitDimsInfo>();
  const add = (sg: Omit<Suggestion, "sources">, source: string) => {
    const id = `${sg.key}|${JSON.stringify(sg.fields)}`;
    const cur = out.get(id);
    if (cur) cur.sources.push(source);
    else out.set(id, { ...sg, sources: [source] });
  };
  for (const l of listings) {
    const p = packingOf(l);
    // تعداد در کارتن برای تخمین: از لیستینگ، وگرنه همان که در محصول ثبت شده
    const est = estimateCarton({ ...p, unitsPerCarton: p.unitsPerCarton ?? current.unitsPerCarton });
    if (current.unitWeightKg === null && p.unitWeightKg)
      add({ key: "unitWeightKg", text: `${s(p.unitWeightKg)} kg`, fields: { unitWeightKg: s(p.unitWeightKg) }, estimated: false }, l.label);
    if (current.unitsPerCarton === null && p.unitsPerCarton)
      add({ key: "unitsPerCarton", text: s(p.unitsPerCarton), fields: { unitsPerCarton: s(p.unitsPerCarton) }, estimated: false }, l.label);
    if (current.cartonWeightKg === null && est.cartonWeightKg)
      add({ key: "cartonWeightKg", text: `${s(est.cartonWeightKg)} kg`, fields: { cartonWeightKg: s(est.cartonWeightKg) }, estimated: est.estimated.cartonWeightKg }, l.label);
    if ((current.cartonLengthCm === null || current.cartonWidthCm === null || current.cartonHeightCm === null) && est.cartonDimsCm) {
      const d = est.cartonDimsCm;
      add(
        {
          key: "cartonDims",
          text: `${s(d.l)}×${s(d.w)}×${s(d.h)} cm`,
          fields: { cartonLengthCm: s(d.l), cartonWidthCm: s(d.w), cartonHeightCm: s(d.h) },
          estimated: est.estimated.cartonDimsCm,
        },
        l.label,
      );
    }
    // ابعاد تکی بدون تعداد در کارتن: فقط برای اطلاع (محصول خانه‌ی «ابعاد تکی» ندارد)
    if (p.unitDimsCm && !est.cartonDimsCm) {
      const t = `${s(p.unitDimsCm.l)}×${s(p.unitDimsCm.w)}×${s(p.unitDimsCm.h)} cm`;
      const u = unitDims.get(t);
      if (u) u.sources.push(l.label);
      else unitDims.set(t, { text: t, sources: [l.label] });
    }
  }
  return { suggestions: [...out.values()], unitDims: [...unitDims.values()] };
}
