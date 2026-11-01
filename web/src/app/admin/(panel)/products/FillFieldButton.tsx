"use client";
// «بگذار در فرم»: مقدار پیش‌نویس AI را فقط در فیلد فرم محصول (همین صفحه) می‌گذارد؛ تا «ذخیره‌ی محصول» زده نشود چیزی ذخیره نمی‌شود. بخش ۴۰.
export function FillFieldButton({ name, value, className }: { name: string; value: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`form [name="${name}"]`);
        if (!el) return;
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.focus();
      }}
    >
      بگذار در فرم
    </button>
  );
}
