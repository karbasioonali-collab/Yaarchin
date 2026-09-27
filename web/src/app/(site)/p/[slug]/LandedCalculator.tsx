"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicLanded } from "@/lib/pricing/compute";
import { fmtDate, fmtNum, unitFa } from "@/lib/format";
import { toLatinDigits } from "@/lib/validation";
import styles from "./product.module.css";

// کارت «قیمت تمام‌شده تا ایران»: مشتری تعداد را عوض می‌کند و هر روش حمل فعال کنار هم نمایش داده می‌شود.
// اولین نمایش از سرور می‌آید (بدون جاوااسکریپت هم دیده می‌شود)؛ تغییر تعداد ← /api/v1/products/[slug]/landed?qty=
export function LandedCalculator({ slug, unit, initial }: { slug: string; unit: string; initial: PublicLanded }) {
  const [data, setData] = useState(initial);
  const [qtyText, setQtyText] = useState(String(initial.qty));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function onQty(v: string) {
    setQtyText(v);
    if (timer.current) clearTimeout(timer.current);
    const qty = Number(toLatinDigits(v).replace(/[,،٬\s]/g, ""));
    if (!Number.isInteger(qty) || qty < 1) {
      setError("تعداد را به عدد صحیح وارد کنید.");
      return;
    }
    setError(null);
    timer.current = setTimeout(async () => {
      const my = ++seq.current;
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/products/${encodeURIComponent(slug)}/landed?qty=${qty}`);
        const j = await res.json();
        if (my !== seq.current) return; // پاسخ یک درخواست قدیمی‌تر
        if (res.ok && j.landed?.status === "ready") setData(j.landed);
        else setError("محاسبه انجام نشد؛ دوباره امتحان کنید.");
      } catch {
        if (my === seq.current) setError("اتصال برقرار نشد؛ دوباره امتحان کنید.");
      } finally {
        if (my === seq.current) setLoading(false);
      }
    }, 450);
  }

  const u = unitFa(unit);
  return (
    <>
      <label className={styles.qtyRow}>
        <span>تعداد سفارش</span>
        <input className={styles.qtyInput} inputMode="numeric" dir="ltr" value={qtyText} onChange={(e) => onQty(e.target.value)} aria-describedby="landed-note" maxLength={9} />
        <span className={styles.muted} style={{ margin: 0 }}>
          {u}
          {loading && " · در حال محاسبه…"}
        </span>
      </label>
      {error && (
        <p className={styles.landedError} role="alert">
          {error}
        </p>
      )}
      {data.belowMoq && data.moq !== null && (
        <p className={styles.landedWarn}>
          کمتر از حداقل سفارش کارخانه‌ها ({fmtNum(data.moq)} {u})؛ قیمت با پله‌ی اول حساب شده و ممکن است کارخانه نپذیرد.
        </p>
      )}

      {data.methods.length ? (
        <div className={styles.methods} aria-live="polite" aria-busy={loading}>
          {data.methods.map((m) => (
            <div key={m.key} className={styles.method}>
              <div className={styles.methodName}>{m.nameFa}</div>
              {m.status === "ok" ? (
                <>
                  <div className={styles.methodUnit}>
                    {fmtNum(m.unit!)} <small>تومان هر {u}</small>
                  </div>
                  <div className={styles.methodTotal}>جمع: {fmtNum(m.total!)} تومان</div>
                </>
              ) : (
                <div className={styles.methodInquiry}>استعلام از کارشناس</div>
              )}
              <div className={styles.methodDays}>
                {m.days ? (m.days.min === m.days.max ? `حدود ${fmtNum(m.days.min)} روز` : `${fmtNum(m.days.min)} تا ${fmtNum(m.days.max)} روز`) : "زمان: استعلام"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.muted}>روش حملی فعال نیست؛ برای قیمت تمام‌شده از کارشناس استعلام بگیرید.</p>
      )}

      <p id="landed-note" className={styles.priceNote}>
        {data.ratesDate && <>با نرخ‌های {fmtDate(data.ratesDate)}. </>}
        زمان کل = آماده‌سازی در کارخانه + حمل. قیمت تخمینی است و قیمت نهایی توسط کارشناس اعلام می‌شود.
      </p>
    </>
  );
}
