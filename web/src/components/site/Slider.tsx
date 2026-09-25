"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import styles from "./Slider.module.css";
import s from "./site.module.css";

export type SlideView = { title: string; text: string; imageUrl: string | null; href: string; cta: string; tone: "green" | "orange" | "dark" };

// اسلایدر صفحه‌ی اصلی: کشیدن با انگشت (scroll-snap)، نقطه‌ها، فلش‌ها و پخش خودکار
// (با لمس/هاور/فوکوس و «کاهش حرکت» سیستم متوقف می‌شود).
export function Slider({ slides, intervalSec }: { slides: SlideView[]; intervalSec: number }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;

  // در RTL مقدار scrollLeft از ۰ به سمت منفی می‌رود؛ جهت از CSS خوانده می‌شود
  const sign = () => (track.current && getComputedStyle(track.current).direction === "rtl" ? -1 : 1);

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el || !n) return;
      const next = (i + n) % n;
      el.scrollTo({ left: sign() * next * el.clientWidth, behavior: "smooth" });
    },
    [n],
  );

  // اسلاید فعلی از روی موقعیت اسکرول (هم با فلش و نقطه، هم با کشیدن انگشت)
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setIndex(Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [n]);

  useEffect(() => {
    if (paused || n < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") go(index + 1);
    }, intervalSec * 1000);
    return () => clearInterval(t);
  }, [paused, index, n, intervalSec, go]);

  if (!n) return null;

  return (
    <section
      className={styles.slider}
      aria-roledescription="carousel"
      aria-label="اسلایدر"
      onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className={styles.track} ref={track}>
        {slides.map((sl, i) => (
          <div
            key={i}
            data-i={i}
            className={`${styles.slide} ${styles[sl.tone]}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} از ${n}`}
          >
            {sl.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.image} src={sl.imageUrl} alt="" loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "auto"} />
            )}
            <div className={styles.content}>
              {sl.title && <h2 className={styles.title}>{sl.title}</h2>}
              {sl.text && <p className={styles.text}>{sl.text}</p>}
              {sl.href && sl.cta && (
                <Link href={sl.href} className={`${s.btn} ${styles.cta}`} tabIndex={i === index ? 0 : -1}>
                  {sl.cta}
                  <Icon name="chevronLeft" size={18} />
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
      {n > 1 && (
        <>
          <button type="button" className={`${styles.arrow} ${styles.prev}`} aria-label="اسلاید قبلی" onClick={() => go(index - 1)}>
            <Icon name="chevronRight" />
          </button>
          <button type="button" className={`${styles.arrow} ${styles.next}`} aria-label="اسلاید بعدی" onClick={() => go(index + 1)}>
            <Icon name="chevronLeft" />
          </button>
          <div className={styles.dots}>
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`${styles.dot} ${i === index ? styles.dotActive : ""}`}
                aria-label={`اسلاید ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
