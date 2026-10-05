"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ui/ActionForm";
import { Field } from "@/components/ui/Field";
import ui from "@/components/ui/ui.module.css";
import { createInquiryAction } from "../../inquiries/actions";

// ساخت درخواست از داخل چت: محصول (پیش‌فرض: محصول همین گفتگو) یا اسم آزاد برای محصولی که در سایت نیست، تعداد، توضیح.
export function InquiryForm({
  conversationId,
  products,
  defaultProductId,
}: {
  conversationId: string;
  products: { id: string; titleFa: string }[];
  defaultProductId: string | null;
}) {
  const [productId, setProductId] = useState(defaultProductId ?? "");
  return (
    <ActionForm action={createInquiryAction} submitLabel="ساخت درخواست" submitVariant="secondary">
      <input type="hidden" name="conversationId" value={conversationId} />
      <label className={ui.field}>
        <span className={ui.label}>محصول</span>
        <select name="productId" value={productId} onChange={(e) => setProductId(e.target.value)} className={ui.select}>
          <option value="">— محصولی که در سایت نیست —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.titleFa}
            </option>
          ))}
        </select>
      </label>
      {!productId && <Field label="اسم محصول" name="productTitle" maxLength={200} required placeholder="مثلاً دستگاه بسته‌بندی پودر" />}
      <Field label="تعداد (اختیاری)" name="qty" inputMode="numeric" ltr />
      <label className={ui.field}>
        <span className={ui.label}>توضیح (اختیاری)</span>
        <textarea name="note" className={ui.textarea} maxLength={2000} rows={3} style={{ minHeight: 70 }} />
      </label>
    </ActionForm>
  );
}
