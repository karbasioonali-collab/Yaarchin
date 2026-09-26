"use client";

import { useState } from "react";
import styles from "./ui.module.css";

// ردیف‌های تکرارشونده داخل یک فرم (پله‌های قیمت، پله‌های زمان آماده‌سازی، مشخصات محصول).
// هر ستون یک input با name یکسان در همه‌ی ردیف‌هاست؛ سرور با fd.getAll(name) ردیف‌ها را کنار هم می‌گذارد
// (lib/catalog/admin-input.ts → rows). ردیف کاملاً خالی نادیده گرفته می‌شود.
export type RowsColumn = { name: string; label: string; placeholder?: string; ltr?: boolean; width?: string; inputMode?: "decimal" | "numeric" | "text" };

export function RowsEditor({
  columns,
  initial = [],
  minRows = 1,
  addLabel = "+ ردیف",
}: {
  columns: RowsColumn[];
  initial?: Record<string, string>[];
  minRows?: number;
  addLabel?: string;
}) {
  const [items, setItems] = useState(() => {
    const base = initial.map((r, i) => ({ key: i, values: r }));
    let k = base.length;
    while (base.length < minRows) base.push({ key: k++, values: {} });
    return base;
  });
  const [next, setNext] = useState(items.length + 1);
  return (
    <div className={styles.rows}>
      <div className={styles.rowsHead} style={{ gridTemplateColumns: `${columns.map((c) => c.width ?? "1fr").join(" ")} 36px` }}>
        {columns.map((c) => (
          <span key={c.name}>{c.label}</span>
        ))}
        <span />
      </div>
      {items.map((it) => (
        <div key={it.key} className={styles.rowsRow} style={{ gridTemplateColumns: `${columns.map((c) => c.width ?? "1fr").join(" ")} 36px` }}>
          {columns.map((c) => (
            <input
              key={c.name}
              name={c.name}
              defaultValue={it.values[c.name] ?? ""}
              placeholder={c.placeholder}
              aria-label={c.label}
              inputMode={c.inputMode}
              className={`${styles.input} ${c.ltr ? styles.ltr : ""}`}
            />
          ))}
          <button type="button" className={styles.rowsRemove} aria-label="حذف ردیف" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}>
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className={styles.secondary}
        onClick={() => {
          setItems((xs) => [...xs, { key: next, values: {} }]);
          setNext((n) => n + 1);
        }}
      >
        {addLabel}
      </button>
    </div>
  );
}
