import { Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { SLUG_HINT } from "@/lib/catalog/admin-input";
import { PRODUCT_STATUS_FA } from "@/lib/catalog/admin-labels";
import { type AdminCategory, categoryLabel } from "@/lib/catalog/admin-tree";
import { UNITS } from "@/lib/format";

type V = {
  titleFa?: string;
  titleEn?: string | null;
  slug?: string;
  categoryId?: string | null;
  summaryFa?: string | null;
  descriptionFa?: string | null;
  priceUnit?: string;
  hsCode?: string | null;
  status?: string;
};

// فیلدهای اصلی محصول (ساخت و ویرایش)
export function ProductFields({ tree, value }: { tree: AdminCategory[]; value?: V }) {
  return (
    <>
      <Field label="نام فارسی" name="titleFa" defaultValue={value?.titleFa ?? ""} required maxLength={200} />
      <Field label="نام انگلیسی" name="titleEn" defaultValue={value?.titleEn ?? ""} ltr maxLength={300} />
      <Field label="slug (آدرس صفحه)" name="slug" defaultValue={value?.slug ?? ""} ltr required maxLength={100} hint={SLUG_HINT} />
      <div className={ui.form} style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <label className={ui.field} style={{ flex: "1 1 220px" }}>
          <span className={ui.label}>دسته</span>
          <select name="categoryId" defaultValue={value?.categoryId ?? ""} className={ui.select}>
            <option value="">— بدون دسته —</option>
            {tree.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c)}
                {c.status === "hidden" ? " (مخفی)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.field} style={{ flex: "1 1 160px" }}>
          <span className={ui.label}>وضعیت انتشار</span>
          <select name="status" defaultValue={value?.status ?? "draft"} className={ui.select}>
            {Object.entries(PRODUCT_STATUS_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.field} style={{ flex: "1 1 140px" }}>
          <span className={ui.label}>واحد قیمت</span>
          <select name="priceUnit" defaultValue={value?.priceUnit ?? "piece"} className={ui.select}>
            {Object.entries(UNITS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div style={{ flex: "1 1 160px" }}>
          <Field label="HS code" name="hsCode" defaultValue={value?.hsCode ?? ""} ltr maxLength={20} hint="فعلاً متن؛ در مرحله‌ی نرخ‌ها به جدول HS وصل می‌شود." />
        </div>
      </div>
      <Field label="خلاصه (یک خط)" name="summaryFa" defaultValue={value?.summaryFa ?? ""} maxLength={500} />
      <label className={ui.field}>
        <span className={ui.label}>توضیحات</span>
        <textarea name="descriptionFa" defaultValue={value?.descriptionFa ?? ""} className={ui.textarea} maxLength={10000} rows={6} />
      </label>
      <p className={ui.hint} style={{ margin: 0 }}>
        پیش‌نویس و مخفی در سایت دیده نمی‌شوند؛ فقط «منتشرشده» در سایت و API عمومی است.
      </p>
    </>
  );
}
