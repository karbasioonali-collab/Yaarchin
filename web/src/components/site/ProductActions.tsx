"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { callProtected, LoginPrompt, Toast } from "./LoginPrompt";
import styles from "./ProductActions.module.css";
import s from "./site.module.css";

const SOON = "این بخش به‌زودی فعال می‌شود.";
const ERROR = "ارتباط برقرار نشد؛ دوباره تلاش کنید.";

// دکمه‌ی قلب: افزودن/حذف علاقه‌مندی. قانون ورود در API (/api/v1/favorites) اعمال می‌شود؛
// جواب 401 ← پنجره‌ی «باید وارد شوید» (بعد از ورود به همین صفحه برمی‌گردد).
// initial: وضعیت فعلی برای مشتری واردشده (برای بقیه false). چند دکمه‌ی یک محصول در یک صفحه
// (بالای صفحه و نوار موبایل) با رویداد yc:favorite هم‌زمان می‌شوند.
const FAV_EVENT = "yc:favorite";

export function FavoriteButton({
  slug,
  initial = false,
  compact = false,
  refreshOnChange = false,
  className,
}: {
  slug: string;
  initial?: boolean;
  compact?: boolean;
  refreshOnChange?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [prompt, setPrompt] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const sync = (e: Event) => {
      const d = (e as CustomEvent<{ slug: string; on: boolean }>).detail;
      if (d.slug === slug) setOn(d.on);
    };
    window.addEventListener(FAV_EVENT, sync);
    return () => window.removeEventListener(FAV_EVENT, sync);
  }, [slug]);

  async function onClick() {
    setBusy(true);
    const want = !on;
    const r = await callProtected("/api/v1/favorites", { product: slug }, want ? "POST" : "DELETE");
    setBusy(false);
    if (r === "ok") {
      window.dispatchEvent(new CustomEvent(FAV_EVENT, { detail: { slug, on: want } }));
      setToast(want ? "به علاقه‌مندی‌ها اضافه شد." : "از علاقه‌مندی‌ها حذف شد.");
      if (refreshOnChange) router.refresh();
    } else if (r === "login") setPrompt(true);
    else if (r === "forbidden") setToast("علاقه‌مندی مخصوص حساب مشتری است.");
    else if (r === "soon") setToast(SOON);
    else setToast(ERROR);
  }

  const label = on ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها";
  return (
    <>
      <button
        type="button"
        className={className ?? (compact ? `${s.iconBtn} ${styles.heartCompact}` : `${s.btnOutline} ${styles.heart}`)}
        onClick={onClick}
        disabled={busy}
        aria-label={label}
        aria-pressed={on}
        title={label}
        data-on={on || undefined}
      >
        <Icon name="heart" filled={on} />
        {!compact && <span>{on ? "در علاقه‌مندی‌ها" : "علاقه‌مندی"}</span>}
      </button>
      <LoginPrompt open={prompt} onClose={() => setPrompt(false)} text="برای ذخیره‌ی محصول در علاقه‌مندی‌ها، وارد حساب کاربری شوید یا ثبت‌نام کنید." />
      <Toast text={toast} onDone={clearToast} />
    </>
  );
}

export function ChatButton({ compact = false }: { compact?: boolean }) {
  return (
    <a href="#chat" className={`${s.btn} ${compact ? styles.chatCompact : styles.chatBtn}`}>
      <Icon name="chat" />
      گفتگو درباره‌ی این محصول
    </a>
  );
}

// باکس چت: فعلاً فقط ظاهر و ورودی پیام. ارسال به /api/v1/chat می‌رود که ورود لازم دارد؛
// پاسخ هوش مصنوعی در مرحله‌ی ۵ وصل می‌شود.
export function ChatBox({ slug, title }: { slug: string; title: string }) {
  const [text, setText] = useState("");
  const [prompt, setPrompt] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clearToast = useCallback(() => setToast(null), []);
  const suggestions = ["قیمت برای ۱۰۰۰ عدد چقدر می‌شود؟", "امکان چاپ لوگوی ما هست؟", "چند روزه به ایران می‌رسد؟"];

  async function send(message: string) {
    const m = message.trim();
    if (!m) return;
    setBusy(true);
    const r = await callProtected("/api/v1/chat", { product: slug, message: m });
    setBusy(false);
    if (r === "login") setPrompt(true);
    else if (r === "soon") setToast("گفتگو به‌زودی فعال می‌شود؛ پیام شما پاک نشد.");
    else if (r === "error") setToast(ERROR);
  }

  return (
    <section id="chat" className={styles.chat} aria-labelledby="chat-title">
      <header className={styles.chatHead}>
        <span className={styles.avatar} aria-hidden="true">
          <Icon name="spark" size={22} />
        </span>
        <span>
          <h2 id="chat-title" className={styles.chatTitle}>
            گفتگو با دستیار یارچین
          </h2>
          <span className={styles.chatSub}>پاسخ فوری با هوش مصنوعی؛ در صورت نیاز، کارشناس ادامه می‌دهد.</span>
        </span>
      </header>
      <div className={styles.messages} aria-live="polite">
        <div className={styles.bubble}>
          سلام! سؤالی درباره‌ی «{title}» دارید؟ قیمت، حداقل سفارش، چاپ لوگو یا هزینه‌ی رسیدن به ایران را بپرسید.
        </div>
        <div className={styles.suggestions}>
          {suggestions.map((q) => (
            <button key={q} type="button" className={s.chip} onClick={() => setText(q)}>
              {q}
            </button>
          ))}
        </div>
      </div>
      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <label htmlFor="chat-input" className={s.srOnly}>
          پیام شما
        </label>
        <textarea
          id="chat-input"
          className={styles.input}
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
        <button type="submit" className={styles.send} disabled={busy || !text.trim()} aria-label="ارسال">
          <Icon name="send" />
        </button>
      </form>
      <LoginPrompt open={prompt} onClose={() => setPrompt(false)} text="برای گفتگو درباره‌ی محصول و دریافت پاسخ، وارد حساب کاربری شوید یا ثبت‌نام کنید." />
      <Toast text={toast} onDone={clearToast} />
    </section>
  );
}

// نوار ثابت پایین صفحه‌ی محصول در موبایل
export function MobileProductBar({
  slug,
  price,
  chat,
  favorite,
  isFavorite = false,
}: {
  slug: string;
  price: string | null;
  chat: boolean;
  favorite: boolean;
  isFavorite?: boolean;
}) {
  return (
    <div className={styles.mobileBar}>
      {favorite && <FavoriteButton slug={slug} initial={isFavorite} compact />}
      {price && <span className={styles.mobilePrice}>{price}</span>}
      {chat && <ChatButton compact />}
    </div>
  );
}
