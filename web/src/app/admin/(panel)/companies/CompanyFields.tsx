import { Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { COMPANY_TYPE_FA } from "@/lib/catalog/admin-labels";

type V = {
  nameEn?: string;
  nameFa?: string | null;
  companyType?: string;
  province?: string | null;
  city?: string | null;
  address?: string | null;
  website?: string | null;
  status?: string;
  notes?: string | null;
};

// فیلدهای مشترک ساخت و ویرایش کارخانه (همه محرمانه؛ هرگز در سایت نمایش داده نمی‌شوند)
export function CompanyFields({ value }: { value?: V }) {
  return (
    <>
      <Field label="نام انگلیسی (همان نام علی‌بابا)" name="nameEn" defaultValue={value?.nameEn ?? ""} ltr required maxLength={200} />
      <Field label="نام فارسی (اختیاری)" name="nameFa" defaultValue={value?.nameFa ?? ""} maxLength={200} />
      <label className={ui.field}>
        <span className={ui.label}>نوع</span>
        <select name="companyType" defaultValue={value?.companyType ?? "unknown"} className={ui.select}>
          {Object.entries(COMPANY_TYPE_FA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <Field label="استان" name="province" defaultValue={value?.province ?? ""} ltr maxLength={100} />
      <Field label="شهر" name="city" defaultValue={value?.city ?? ""} ltr maxLength={100} />
      <Field label="آدرس" name="address" defaultValue={value?.address ?? ""} ltr maxLength={500} />
      <Field label="وب‌سایت" name="website" defaultValue={value?.website ?? ""} ltr maxLength={500} hint="https://…" />
      {value?.status !== "merged" && (
        <label className={ui.field}>
          <span className={ui.label}>وضعیت</span>
          <select name="status" defaultValue={value?.status ?? "active"} className={ui.select}>
            <option value="active">فعال (قیمت‌هایش در سایت حساب می‌شود)</option>
            <option value="blocked">مسدود (هیچ لیستینگش در سایت حساب نمی‌شود)</option>
          </select>
        </label>
      )}
      <label className={ui.field}>
        <span className={ui.label}>یادداشت داخلی</span>
        <textarea name="notes" defaultValue={value?.notes ?? ""} className={ui.textarea} maxLength={5000} />
      </label>
    </>
  );
}
