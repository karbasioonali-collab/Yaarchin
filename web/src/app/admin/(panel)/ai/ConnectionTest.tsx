"use client";
// دکمه‌ی «تست اتصال» (کار با کلید لیارا حتی وقتی دستیار برای مشتری‌ها خاموش است)
import { useState } from "react";
import ui from "@/components/ui/ui.module.css";
import type { TestStep } from "@/lib/ai/connection-test";
import { connectionTestAction } from "./actions";

export function ConnectionTest({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; steps: TestStep[] } | { error: string } | null>(null);
  return (
    <div>
      <button
        type="button"
        className={ui.primary}
        disabled={!enabled || busy}
        onClick={async () => {
          setBusy(true);
          setRes(null);
          try {
            setRes(await connectionTestAction());
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "در حال آزمودن… (تا یک دقیقه)" : "تست اتصال"}
      </button>
      {res && "error" in res && (
        <p className={ui.error} role="alert">
          {res.error}
        </p>
      )}
      {res && "steps" in res && (
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 6 }} aria-live="polite">
          <li style={{ fontWeight: 700 }}>{res.ok ? "✓ همه‌چیز درست کار می‌کند." : "✗ بعضی مرحله‌ها ناموفق بود."}</li>
          {res.steps.map((s) => (
            <li key={s.name} style={{ fontSize: 14 }}>
              <span style={{ color: s.ok ? "var(--green)" : "#B3261E", fontWeight: 700 }}>{s.ok ? "✓" : "✗"}</span> {s.name}: {s.detail}{" "}
              <span style={{ color: "var(--muted)", fontSize: 12 }}>({(s.ms / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ثانیه)</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
