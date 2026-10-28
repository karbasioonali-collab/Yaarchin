"use client";

import { useState, useTransition } from "react";
import { verdictAction } from "./actions";

type Verdict = "correct" | "wrong";

// قضاوت «درست/اشتباه»: انتخاب همان لحظه دیده می‌شود و ثبت در پس‌زمینه است (بدون بازسازی صفحه‌ی ۳۸ ردیفی).
// خطا ← برگشت به انتخاب قبلی و پیام.
export function VerdictButtons({ resultId, initial, className, buttonClass }: { resultId: number; initial: Verdict | null; className?: string; buttonClass?: string }) {
  const [verdict, setVerdict] = useState<Verdict | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const pick = (v: Verdict) => {
    const prev = verdict;
    setVerdict(v);
    setError(null);
    start(async () => {
      const r = await verdictAction(resultId, v).catch(() => ({ error: "ثبت نشد؛ دوباره امتحان کنید." }));
      if ("error" in r) {
        setVerdict(prev);
        setError(r.error);
      }
    });
  };
  return (
    <div className={className} data-testid="verdict">
      {verdict && <div style={{ fontWeight: 700 }}>{verdict === "correct" ? "درست" : "اشتباه"}</div>}
      <button type="button" className={buttonClass} onClick={() => pick("correct")} aria-pressed={verdict === "correct"}>
        درست
      </button>
      <button type="button" className={buttonClass} onClick={() => pick("wrong")} aria-pressed={verdict === "wrong"}>
        اشتباه
      </button>
      {error && (
        <div role="alert" style={{ color: "#B3261E", fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
