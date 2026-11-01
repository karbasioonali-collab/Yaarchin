"use client";

// «همه عمومی» / «هیچ‌کدام»: تیک «عمومی» همه‌ی عکس‌های همین فرم (name="public_<id>"). docs/infoyaarchin.md بخش ۳۷.
export function AllPublicButton({ className }: { className?: string }) {
  const set = (on: boolean, el: HTMLElement) =>
    el
      .closest("form")
      ?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name^="public_"]')
      .forEach((c) => (c.checked = on));
  return (
    <span style={{ display: "inline-flex", gap: 8 }}>
      <button type="button" className={className} onClick={(e) => set(true, e.currentTarget)}>
        همه عمومی
      </button>
      <button type="button" className={className} onClick={(e) => set(false, e.currentTarget)}>
        هیچ‌کدام عمومی
      </button>
    </span>
  );
}
