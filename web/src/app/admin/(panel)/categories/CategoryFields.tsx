import { Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { SLUG_HINT } from "@/lib/catalog/admin-input";
import { type AdminCategory, categoryLabel } from "@/lib/catalog/admin-tree";

// فیلدهای مشترک فرم ساخت و ویرایش دسته. excluded: خودش و زیرشاخه‌هایش (نمی‌توانند والد شوند).
export function CategoryFields({ tree, value, excluded }: { tree: AdminCategory[]; value?: Partial<AdminCategory>; excluded?: Set<string> }) {
  return (
    <>
      <Field label="نام فارسی" name="nameFa" defaultValue={value?.nameFa ?? ""} required maxLength={120} />
      <Field label="نام انگلیسی" name="nameEn" defaultValue={value?.nameEn ?? ""} ltr maxLength={120} />
      <Field label="slug (آدرس)" name="slug" defaultValue={value?.slug ?? ""} ltr required maxLength={80} hint={SLUG_HINT} />
      <label className={ui.field}>
        <span className={ui.label}>دسته‌ی والد</span>
        <select name="parentId" defaultValue={value?.parentId ?? ""} className={ui.select}>
          <option value="">— دسته‌ی اصلی (بدون والد) —</option>
          {tree
            .filter((c) => !excluded?.has(c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c)}
              </option>
            ))}
        </select>
      </label>
      <label className={ui.field}>
        <span className={ui.label}>توضیح کوتاه</span>
        <textarea name="descriptionFa" defaultValue={value?.descriptionFa ?? ""} className={ui.textarea} maxLength={1000} />
      </label>
      <Field label="آدرس عکس" name="image" defaultValue={value?.image ?? ""} ltr maxLength={1000} hint="https://… (آپلود عکس در مرحله‌ی بعد)" />
      <Field
        label="ترتیب نمایش"
        name="sortOrder"
        defaultValue={String(value?.sortOrder ?? 0)}
        ltr
        inputMode="numeric"
        hint="عدد کوچک‌تر اول می‌آید؛ در فهرست با ↑ ↓ هم جابه‌جا می‌شود."
      />
      <label className={ui.field}>
        <span className={ui.label}>وضعیت</span>
        <select name="status" defaultValue={value?.status ?? "active"} className={ui.select}>
          <option value="active">فعال (در سایت دیده می‌شود)</option>
          <option value="hidden">مخفی (خودش و زیرشاخه‌هایش در سایت دیده نمی‌شوند)</option>
        </select>
      </label>
    </>
  );
}
