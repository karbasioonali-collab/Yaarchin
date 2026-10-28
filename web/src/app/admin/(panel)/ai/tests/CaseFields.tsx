import { Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { HANDOFF_FA } from "@/lib/ai/rules";
import type { TestCase } from "@/lib/ai/tests";

// فیلدهای مشترک ساخت و ویرایش سؤال آزمون (docs/infoyaarchin.md بخش ۳۳)
export function CaseFields({ item }: { item?: TestCase }) {
  const e = item?.expect;
  return (
    <>
      {item && <input type="hidden" name="id" value={item.id} />}
      <label className={ui.field}>
        <span className={ui.label}>سؤال مشتری</span>
        <textarea name="question" className={ui.textarea} rows={2} defaultValue={item?.question ?? ""} required maxLength={1000} />
      </label>
      <label className={ui.field}>
        <span className={ui.label}>جواب یا رفتار درست (برای مقایسه‌ی انسانی کنار جواب دستیار)</span>
        <textarea name="expectedAnswer" className={ui.textarea} rows={3} defaultValue={item?.expectedAnswer ?? ""} maxLength={2000} />
      </label>
      <label className={ui.field}>
        <span className={ui.label}>دسته</span>
        <select name="category" defaultValue={item?.category ?? "normal"} className={ui.select}>
          <option value="normal">معمولی</option>
          <option value="tricky">فریبنده</option>
          <option value="handoff">ارجاع</option>
        </select>
      </label>
      <Field
        label="slug محصول (اختیاری)"
        name="productSlug"
        defaultValue={item?.productSlug ?? ""}
        ltr
        maxLength={120}
        hint="سؤال مثل گفتگوی صفحه‌ی همین محصول پرسیده می‌شود؛ اگر محصول منتشرشده نباشد، بدون محصول."
      />
      <label className={ui.field}>
        <span className={ui.label}>ارجاع مورد انتظار (بررسی خودکار)</span>
        <select name="handoff" defaultValue={e?.handoff ?? ""} className={ui.select}>
          <option value="">مهم نیست</option>
          <option value="none">نباید ارجاع دهد</option>
          <option value="any">باید ارجاع دهد (هر دلیلی)</option>
          {Object.entries(HANDOFF_FA).map(([k, v]) => (
            <option key={k} value={k}>
              باید ارجاع دهد: {v}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="منبع مورد انتظار (اختیاری)"
        name="source"
        defaultValue={e?.source ?? ""}
        ltr
        hint="product، calculator، knowledge، general یا canned (جواب آماده)؛ چند گزینه با |. فقط وقتی ارجاع نشده سنجیده می‌شود."
      />
      <label className={ui.field}>
        <span className={ui.label}>کلمه‌های ممنوع در جواب (هر خط یکی)</span>
        <textarea name="forbidden" className={ui.textarea} rows={2} defaultValue={(e?.forbidden ?? []).join("\n")} />
        <span className={ui.hint}>لینک، تلفن، ایمیل، سایت خرید و اسم کارخانه‌ها را محافظ همیشه بررسی می‌کند؛ رد محافظ = رد آزمون.</span>
      </label>
      <label className={ui.field}>
        <span className={ui.label}>کلمه‌هایی که جواب باید داشته باشد (هر خط یکی، مثلاً «تخمینی»)</span>
        <textarea name="mustInclude" className={ui.textarea} rows={2} defaultValue={(e?.mustInclude ?? []).join("\n")} />
      </label>
      <label className={ui.field}>
        <span className={ui.label}>وضعیت</span>
        <select name="status" defaultValue={item?.status ?? "active"} className={ui.select}>
          <option value="active">فعال (در اجراها)</option>
          <option value="draft">پیش‌نویس (فقط با انتخاب دستی)</option>
        </select>
      </label>
    </>
  );
}
