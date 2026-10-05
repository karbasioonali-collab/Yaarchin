"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import ui from "@/components/ui/ui.module.css";
import { SENDER_FA, type StaffMsg } from "@/lib/chat/dto";
import styles from "../chats.module.css";
import { sendStaffMessageAction } from "../actions";

// رشته‌ی پیام‌ها در پنل: هر پیام با فرستنده (مشتری / سیستم / اسم کارشناس) و زمان. رویدادهای داخلی (ارجاع) با برچسب «داخلی».
// polling: هر ۴ ثانیه وقتی تب جلوی چشم است، هر ۲۰ ثانیه در پس‌زمینه (/admin/chats/<id>/feed).
// اگر وضعیت یا کارشناس گفتگو از جای دیگر عوض شد، صفحه refresh می‌شود تا دکمه‌ها و دسترسی‌ها درست بمانند.
const VISIBLE_MS = 4000;
const HIDDEN_MS = 20000;
const when = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tehran" });

export function StaffThread({
  conversationId,
  initial,
  canReply,
  replyHint,
  status,
  assignedTo,
}: {
  conversationId: string;
  initial: StaffMsg[];
  canReply: boolean;
  replyHint: string | null;
  status: "open" | "closed";
  assignedTo: string | null;
}) {
  const router = useRouter();
  const [msgs, setMsgs] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = msgs.at(-1)?.id ?? 0;
  const lastRef = useRef(lastId);
  useEffect(() => {
    lastRef.current = lastId;
  }, [lastId]);
  const stateRef = useRef({ status, assignedTo });

  const merge = useCallback((more: StaffMsg[]) => {
    if (!more.length) return;
    setMsgs((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      const add = more.filter((m) => !seen.has(m.id));
      return add.length ? [...cur, ...add].sort((a, b) => a.id - b.id) : cur;
    });
  }, []);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const visible = document.visibilityState === "visible";
      try {
        const r = await fetch(`/admin/chats/${conversationId}/feed?after=${lastRef.current}${visible ? "&read=1" : ""}`, { cache: "no-store" });
        if (r.ok && r.headers.get("content-type")?.includes("json")) {
          const j = (await r.json()) as { status: "open" | "closed"; assignedTo: string | null; messages: StaffMsg[] };
          if (!stop) {
            merge(j.messages);
            if (j.status !== stateRef.current.status || j.assignedTo !== stateRef.current.assignedTo) {
              stateRef.current = { status: j.status, assignedTo: j.assignedTo };
              router.refresh();
            }
          }
        }
      } catch {
        /* دور بعد */
      }
      if (!stop) timer = setTimeout(tick, document.visibilityState === "visible" ? VISIBLE_MS : HIDDEN_MS);
    };
    timer = setTimeout(tick, VISIBLE_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [conversationId, merge, router]);

  useEffect(() => {
    stateRef.current = { status, assignedTo };
  }, [status, assignedTo]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  async function send() {
    const m = text.trim();
    if (!m || busy) return;
    setBusy(true);
    setError(null);
    const r = await sendStaffMessageAction(conversationId, m).catch(() => ({ error: "ارتباط برقرار نشد؛ دوباره تلاش کنید." }));
    setBusy(false);
    if ("error" in r) setError(r.error);
    else {
      setText("");
      merge([r.message]);
    }
  }

  return (
    <div className={styles.thread}>
      <div ref={listRef} className={styles.list} aria-live="polite">
        {msgs.map((m) =>
          m.event ? (
            <div key={m.id} className={`${styles.event} ${m.internal ? styles.internal : ""}`}>
              {m.internal && <span className={styles.tag}>داخلی</span>} {m.body} <span className={styles.time}>{when.format(new Date(m.at))}</span>
            </div>
          ) : (
            <div key={m.id} className={`${styles.msg} ${m.from === "customer" ? styles.fromCustomer : m.from === "staff" ? styles.fromStaff : styles.fromSystem}`}>
              <div className={styles.meta}>
                <strong>{m.from === "staff" ? (m.name ?? SENDER_FA.staff) : SENDER_FA[m.from]}</strong>
                {m.from === "customer" && m.name && <span> · {m.name}</span>}
                <span className={styles.time}>{when.format(new Date(m.at))}</span>
              </div>
              <div className={styles.body} dir="auto">
                {m.body}
              </div>
            </div>
          ),
        )}
        {!msgs.length && <p className={styles.time}>هنوز پیامی نیست.</p>}
      </div>
      {canReply ? (
        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            className={ui.textarea}
            style={{ minHeight: 70 }}
            value={text}
            maxLength={2000}
            placeholder="پاسخ به مشتری… (Enter برای ارسال، Shift+Enter برای خط تازه)"
            aria-label="پاسخ"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
          {error && (
            <p className={ui.error} role="alert">
              {error}
            </p>
          )}
          <button type="submit" className={ui.primary} disabled={busy || !text.trim()}>
            {busy ? "…" : "ارسال"}
          </button>
        </form>
      ) : (
        replyHint && <p className={styles.hint}>{replyHint}</p>
      )}
    </div>
  );
}
