"use client";
// «بگذار در فرم» / «استفاده»: مقدار(ها) را فقط در فیلد(های) فرم همین صفحه می‌گذارد؛ تا «ذخیره‌ی محصول» زده نشود چیزی ذخیره نمی‌شود.
// بخش‌های ۴۰ (پیش‌نویس AI) و ۴۱ (پیشنهاد بسته‌بندی از مشخصات).
export function FillFieldButton({
  name,
  value,
  values,
  label = "بگذار در فرم",
  className,
}: {
  name?: string;
  value?: string;
  values?: Record<string, string>;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const all = values ?? (name ? { [name]: value ?? "" } : {});
        let first: HTMLElement | null = null;
        for (const [n, v] of Object.entries(all)) {
          const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`form [name="${n}"]`);
          if (!el) continue;
          el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          first ??= el;
        }
        first?.scrollIntoView({ block: "center", behavior: "smooth" });
        first?.focus();
      }}
    >
      {label}
    </button>
  );
}
