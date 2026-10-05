"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CustomerMsg } from "@/lib/chat/dto";
import { Icon } from "./Icon";
import { LoginPrompt, Toast } from "./LoginPrompt";
import pa from "./ProductActions.module.css";
import styles from "./ChatThread.module.css";
import s from "./site.module.css";

// رشته‌ی پیام‌های یک گفتگوی مشتری + ورودی پیام. هم در باکس صفحه‌ی محصول و هم در «گفتگوهای من».
// پیام تازه بدون رفرش: polling سبک (هر ۴ ثانیه وقتی تب جلوی چشم است، هر ۲۰ ثانیه در پس‌زمینه) به
// /api/v1/chat/<id>?after=<آخرین id>. چرا نه WebSocket/SSE: docs/infoyaarchin.md بخش ۲۴.
const VISIBLE_MS = 4000;
const HIDDEN_MS = 20000;
const time = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" });
const day = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeZone: "Asia/Tehran" });
const WHO: Record<CustomerMsg["from"], string> = { me: "شما", staff: "کارشناس یارچین", system: "یارچین", ai: "دستیار یارچین" };

type Status = "open" | "closed";
type Res = { conversation: { id: string; status: Status } | null; messages: CustomerMsg[]; message?: string };

export function ChatThread({
  conversationId: initialId,
  product,
  initial,
  initialStatus,
  intro,
  suggestions = [],
  onCreated,
  tall = false,
}: {
  conversationId: string | null;
  product?: string;
  initial: CustomerMsg[];
  initialStatus: Status | null;
  intro?: ReactNode;
  suggestions?: string[];
  onCreated?: (id: string) => void;
  tall?: boolean;
}) {
  const [id, setId] = useState(initialId);
  const [msgs, setMsgs] = useState<CustomerMsg[]>(initial);
  const [status, setStatus] = useState<Status | null>(initialStatus);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [login, setLogin] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = msgs.at(-1)?.id ?? 0;
  const lastRef = useRef(lastId);
  useEffect(() => {
    lastRef.current = lastId;
  }, [lastId]);
  const clearToast = useCallback(() => setToast(null), []);

  const merge = useCallback((more: CustomerMsg[]) => {
    if (!more.length) return;
    setMsgs((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      const add = more.filter((m) => !seen.has(m.id));
      return add.length ? [...cur, ...add].sort((a, b) => a.id - b.id) : cur;
    });
  }, []);

  // polling
  useEffect(() => {
    if (!id) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const visible = document.visibilityState === "visible";
      try {
        const r = await fetch(`/api/v1/chat/${id}?after=${lastRef.current}${visible ? "&read=1" : ""}`, { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as Res;
          if (!stop) {
            merge(j.messages);
            if (j.conversation) setStatus(j.conversation.status);
          }
        }
      } catch {
        /* شبکه قطع است؛ دور بعد دوباره */
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
  }, [id, merge]);

  // پیام تازه ← پایین لیست
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  async function send(raw: string) {
    const m = raw.trim();
    if (!m || busy) return;
    setBusy(true);
    try {
      const url = id ? `/api/v1/chat/${id}` : "/api/v1/chat";
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(id ? { message: m } : { product, message: m }) });
      const j = (await r.json().catch(() => null)) as Res | null;
      if (r.ok && j?.conversation) {
        setText("");
        merge(j.messages);
        setStatus(j.conversation.status);
        if (!id) {
          setId(j.conversation.id);
          onCreated?.(j.conversation.id);
        }
      } else if (r.status === 401) setLogin(true);
      else if (r.status === 503) setToast("گفتگو فعلاً خاموش است؛ کمی بعد دوباره امتحان کنید.");
      else setToast(j?.message ?? "پیام فرستاده نشد؛ دوباره تلاش کنید.");
    } catch {
      setToast("ارتباط برقرار نشد؛ دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div ref={listRef} className={`${pa.messages} ${styles.list} ${tall ? styles.tall : ""}`} aria-live="polite">
        {intro}
        {!msgs.length && suggestions.length > 0 && (
          <div className={pa.suggestions}>
            {suggestions.map((q) => (
              <button key={q} type="button" className={s.chip} onClick={() => setText(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => {
          const d = day.format(new Date(m.at));
          const showDay = i === 0 || d !== day.format(new Date(msgs[i - 1].at));
          return (
            <div key={m.id} style={{ display: "contents" }}>
              {showDay && <div className={styles.day}>{d}</div>}
              {m.event ? (
                <div className={styles.event}>{m.body}</div>
              ) : (
                <div className={`${pa.bubble} ${m.from === "me" ? styles.mine : m.from === "system" ? styles.system : ""}`}>
                  <div className={styles.who}>{WHO[m.from]}</div>
                  <div className={styles.body} dir="auto">
                    {m.body}
                  </div>
                  <div className={styles.time}>{time.format(new Date(m.at))}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {status === "closed" && <p className={styles.closed}>این گفتگو بسته شده؛ با فرستادن پیام تازه دوباره باز می‌شود.</p>}
      <form
        className={pa.composer}
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <label htmlFor={`chat-input-${id ?? product}`} className={s.srOnly}>
          پیام شما
        </label>
        <textarea
          id={`chat-input-${id ?? product}`}
          className={pa.input}
          rows={1}
          maxLength={2000}
          placeholder="پیامتان را بنویسید…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(text);
            }
          }}
        />
        <button type="submit" className={pa.send} disabled={busy || !text.trim()} aria-label="ارسال">
          <Icon name="send" />
        </button>
      </form>
      <LoginPrompt open={login} onClose={() => setLogin(false)} text="نشست شما تمام شده؛ دوباره وارد شوید. پیامتان پاک نشد." />
      <Toast text={toast} onDone={clearToast} />
    </>
  );
}
