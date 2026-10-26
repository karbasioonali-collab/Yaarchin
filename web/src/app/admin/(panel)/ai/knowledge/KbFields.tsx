import { Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import type { KbItem } from "@/lib/ai/kb";

// فیلدهای مشترک ساخت و ویرایش مورد پایگاه دانش
export function KbFields({ item }: { item?: KbItem }) {
  return (
    <>
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field label="سؤال" name="question" defaultValue={item?.question ?? ""} required maxLength={500} />
      <label className={ui.field}>
        <span className={ui.label}>شکل‌های دیگر پرسیدن (هر خط یکی)</span>
        <textarea name="variants" className={ui.textarea} rows={3} defaultValue={(item?.variants ?? []).join("\n")} />
      </label>
      <label className={ui.field}>
        <span className={ui.label}>جواب</span>
        <textarea name="answer" className={ui.textarea} rows={6} defaultValue={item?.answer ?? ""} required maxLength={4000} />
        <span className={ui.hint}>
          فقط سیاست و روند ثابت یارچین. عدد متغیر (قیمت، هزینه‌ی حمل، تعرفه) ننویسید؛ آن‌ها از ماشین‌حساب سایت می‌آیند. نام هیچ کارخانه، سایت خرید یا شرکتی ننویسید.
        </span>
      </label>
      <Field label="دسته (اختیاری)" name="category" defaultValue={item?.category ?? ""} maxLength={100} />
      <label className={ui.field}>
        <span className={ui.label}>وضعیت</span>
        <select name="status" defaultValue={item?.status ?? "draft"} className={ui.select}>
          <option value="active">فعال (دستیار از آن جواب می‌دهد)</option>
          <option value="draft">پیش‌نویس (دستیار نمی‌بیند)</option>
        </select>
      </label>
    </>
  );
}
