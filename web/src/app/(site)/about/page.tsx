import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/site/Icon";
import s from "@/components/site/site.module.css";
import { getBlock } from "@/lib/site/get";
import styles from "../pages.module.css";

export const metadata: Metadata = { title: "درباره‌ی ما" };

const ICONS: IconName[] = ["factory", "truck", "chat", "shield", "spark", "check", "box", "home"];

export default async function AboutPage() {
  const { data } = await getBlock("page.about");
  return (
    <div className={s.container}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>{data.title}</h1>
        {data.intro && <p className={styles.heroText}>{data.intro}</p>}
      </section>
      {data.sections.length > 0 && (
        <div className={styles.features}>
          {data.sections.map((sec, i) => (
            <article key={i} className={styles.feature}>
              <span className={`${styles.featureIcon} ${i % 2 ? styles.featureIconAlt : ""}`}>
                <Icon name={ICONS[i % ICONS.length]} size={24} />
              </span>
              {sec.title && <h2 className={styles.featureTitle}>{sec.title}</h2>}
              {sec.text && <p className={styles.featureText}>{sec.text}</p>}
            </article>
          ))}
        </div>
      )}
      <div className={styles.ctaBox}>
        <div>
          <strong>سؤالی دارید؟</strong>
          <span>کارشناس‌های یارچین آماده‌ی پاسخ‌گویی هستند.</span>
        </div>
        <Link href="/contact" className={s.btn}>
          تماس با ما
        </Link>
      </div>
    </div>
  );
}
