"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { PublicMedia } from "@/lib/catalog/public";
import { fmtNum } from "@/lib/format";
import { Icon } from "./Icon";
import styles from "./Gallery.module.css";

const MAX_ZOOM = 4;

// گالری عکس و ویدیوی محصول + نمای تمام‌صفحه با زوم (دو انگشت، چرخ موس، دوبار کلیک، دکمه‌ها) و جابه‌جایی با کشیدن.
export function Gallery({ media, title }: { media: PublicMedia[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const swipe = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const n = media.length;
  const go = useCallback((i: number) => setIndex(((i % n) + n) % n), [n]);

  if (!n) {
    return (
      <div className={styles.main}>
        <div className={styles.placeholder}>
          <Icon name="box" size={48} />
        </div>
      </div>
    );
  }
  const cur = media[index];

  // کشیدن افقی روی عکس اصلی در موبایل = عکس بعدی/قبلی؛ ضربه = بزرگ‌نمایی
  const onDown = (e: RPointerEvent) => (swipe.current = { x: e.clientX, y: e.clientY, moved: false });
  const onUp = (e: RPointerEvent) => {
    const st = swipe.current;
    swipe.current = null;
    if (!st) return;
    const dx = e.clientX - st.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - st.y)) go(index + (dx > 0 ? 1 : -1)); // RTL: کشیدن به راست = بعدی
    else if (cur.kind === "image") setOpen(true);
  };

  return (
    <div className={styles.gallery}>
      <div className={styles.main}>
        {cur.kind === "video" ? (
          <video key={cur.url} className={styles.video} src={cur.url} poster={cur.posterUrl ?? undefined} controls playsInline preload="metadata" aria-label={cur.alt} />
        ) : (
          <button type="button" className={styles.mainButton} onPointerDown={onDown} onPointerUp={onUp} onKeyDown={(e) => e.key === "Enter" && setOpen(true)} aria-label={`بزرگ‌نمایی: ${cur.alt}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cur.url} alt={cur.alt} width={cur.width ?? 800} height={cur.height ?? 800} draggable={false} fetchPriority="high" />
          </button>
        )}
        <button type="button" className={styles.zoomHint} onClick={() => setOpen(true)} aria-label="نمایش تمام‌صفحه">
          <Icon name="zoomIn" size={20} />
        </button>
        {n > 1 && <span className={styles.counter}>{`${fmtNum(index + 1)} / ${fmtNum(n)}`}</span>}
      </div>

      {n > 1 && (
        <div className={styles.thumbs} role="tablist" aria-label="عکس‌ها و ویدیوها">
          {media.map((m, i) => (
            <button
              key={m.url}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={m.kind === "video" ? `ویدیو: ${m.alt}` : m.alt}
              className={`${styles.thumb} ${i === index ? styles.thumbActive : ""}`}
              onClick={() => setIndex(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {(m.kind === "image" || m.posterUrl) && <img src={m.kind === "image" ? m.url : (m.posterUrl as string)} alt="" loading="lazy" />}
              {m.kind === "video" && (
                <span className={styles.play}>
                  <Icon name="play" size={18} filled />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {open && <Lightbox media={media} index={index} onIndex={go} onClose={() => setOpen(false)} title={title} />}
    </div>
  );
}

function Lightbox({ media, index, onIndex, onClose, title }: { media: PublicMedia[]; index: number; onIndex: (i: number) => void; onClose: () => void; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  // زوم مال همان عکسی است که با آن ساخته شده؛ با عوض شدن عکس خودبه‌خود به ۱ برمی‌گردد
  const [zs, setZs] = useState({ i: index, s: 1, x: 0, y: 0 });
  const z = zs.i === index ? zs : { i: index, s: 1, x: 0, y: 0 };
  const setZ = useCallback(
    (v: { s: number; x: number; y: number } | ((p: { s: number; x: number; y: number }) => { s: number; x: number; y: number })) =>
      setZs((prev) => {
        const base = prev.i === index ? prev : { i: index, s: 1, x: 0, y: 0 };
        return { ...(typeof v === "function" ? v(base) : v), i: index };
      }),
    [index],
  );
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; s: number; startX: number; startY: number; x: number; y: number } | null>(null);
  const cur = media[index];
  const n = media.length;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const clamp = useCallback((s: number, x: number, y: number) => {
    const el = stage.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    const mx = ((s - 1) * w) / 2;
    const my = ((s - 1) * h) / 2;
    return { s, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  }, []);

  const zoomTo = useCallback((s: number) => setZ((p) => clamp(Math.max(1, Math.min(MAX_ZOOM, s)), p.x, p.y)), [clamp, setZ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onIndex(index + 1);
      else if (e.key === "ArrowRight") onIndex(index - 1);
      else if (e.key === "+" || e.key === "=") zoomTo(z.s + 0.5);
      else if (e.key === "-") zoomTo(z.s - 0.5);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, onIndex, z.s, zoomTo]);

  const onWheel = (e: React.WheelEvent) => {
    if (cur.kind !== "image") return;
    zoomTo(z.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  const onPointerDown = (e: RPointerEvent) => {
    if (cur.kind !== "image") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    gesture.current = {
      dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      s: z.s,
      startX: e.clientX,
      startY: e.clientY,
      x: z.x,
      y: z.y,
    };
  };
  const onPointerMove = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && g.dist) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setZ((p) => clamp(Math.max(1, Math.min(MAX_ZOOM, (g.s * d) / g.dist)), p.x, p.y));
    } else if (pts.length === 1 && z.s > 1) {
      setZ(clamp(z.s, g.x + (e.clientX - g.startX), g.y + (e.clientY - g.startY)));
    }
  };
  const onPointerUp = (e: RPointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (g && pointers.current.size === 0 && z.s === 1 && g.dist === 0) {
      const dx = e.clientX - g.startX;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - g.startY)) onIndex(index + (dx > 0 ? 1 : -1));
    }
    if (pointers.current.size === 0) gesture.current = null;
  };

  return (
    <dialog ref={dialog} className={styles.lightbox} onClose={onClose} aria-label={`${title} — نمایش تمام‌صفحه`}>
      <div className={styles.lbTop}>
        <span className={styles.lbCount}>{`${fmtNum(index + 1)} / ${fmtNum(n)}`}</span>
        {cur.kind === "image" && (
          <span className={styles.lbZoom}>
            <button type="button" onClick={() => zoomTo(z.s - 0.5)} aria-label="کوچک‌نمایی" disabled={z.s <= 1}>
              <Icon name="zoomOut" />
            </button>
            <span className={styles.lbLevel}>{`${fmtNum(Math.round(z.s * 100))}٪`}</span>
            <button type="button" onClick={() => zoomTo(z.s + 0.5)} aria-label="بزرگ‌نمایی" disabled={z.s >= MAX_ZOOM}>
              <Icon name="zoomIn" />
            </button>
          </span>
        )}
        <button type="button" className={styles.lbClose} onClick={() => dialog.current?.close()} aria-label="بستن" autoFocus>
          <Icon name="close" />
        </button>
      </div>

      <div
        ref={stage}
        className={styles.stage}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => (z.s > 1 ? setZ({ s: 1, x: 0, y: 0 }) : zoomTo(2.5))}
        style={{ cursor: cur.kind === "image" ? (z.s > 1 ? "grab" : "zoom-in") : "default" }}
      >
        {cur.kind === "video" ? (
          <video key={cur.url} className={styles.lbVideo} src={cur.url} poster={cur.posterUrl ?? undefined} controls autoPlay playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cur.url}
            alt={cur.alt}
            draggable={false}
            className={styles.lbImage}
            style={{ transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})` }}
          />
        )}
      </div>

      {n > 1 && (
        <>
          <button type="button" className={`${styles.lbNav} ${styles.lbPrev}`} onClick={() => onIndex(index - 1)} aria-label="قبلی">
            <Icon name="chevronRight" size={26} />
          </button>
          <button type="button" className={`${styles.lbNav} ${styles.lbNext}`} onClick={() => onIndex(index + 1)} aria-label="بعدی">
            <Icon name="chevronLeft" size={26} />
          </button>
        </>
      )}
    </dialog>
  );
}
