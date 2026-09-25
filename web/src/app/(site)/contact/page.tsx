import type { Metadata } from "next";
import { Icon, type IconName } from "@/components/site/Icon";
import s from "@/components/site/site.module.css";
import { getBlock } from "@/lib/site/get";
import styles from "../pages.module.css";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "تماس با ما" };

export default async function ContactPage() {
  const { data } = await getBlock("page.contact");
  const tel = data.phone.replace(/[^\d+]/g, "");
  const items: { icon: IconName; label: string; value: string; href?: string; ltr?: boolean }[] = [
    ...(data.address ? [{ icon: "pin" as IconName, label: "آدرس", value: data.address }] : []),
    ...(data.phone ? [{ icon: "phone" as IconName, label: "تلفن", value: data.phone, href: `tel:${tel}`, ltr: true }] : []),
    ...(data.email ? [{ icon: "mail" as IconName, label: "ایمیل", value: data.email, href: `mailto:${data.email}`, ltr: true }] : []),
    ...(data.hours ? [{ icon: "clock" as IconName, label: "ساعت پاسخ‌گویی", value: data.hours }] : []),
  ];

  return (
    <div className={s.container}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>{data.title}</h1>
        {data.intro && <p className={styles.heroText}>{data.intro}</p>}
      </section>
      <div className={styles.contactGrid}>
        <ul className={styles.infoList}>
          {items.map((it) => (
            <li key={it.label} className={styles.infoItem}>
              <span className={styles.infoIcon}>
                <Icon name={it.icon} />
              </span>
              <span>
                <span className={styles.infoLabel}>{it.label}</span>
                {it.href ? (
                  <a href={it.href} className={`${styles.infoValue} ${it.ltr ? s.ltr : ""}`}>
                    {it.value}
                  </a>
                ) : (
                  <span className={styles.infoValue}>{it.value}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <div className={styles.formCard}>
          <h2 className={styles.formTitle}>ارسال پیام</h2>
          <p className={styles.formSub}>برای ارسال پیام نیازی به ثبت‌نام نیست.</p>
          <ContactForm subjects={data.subjects} />
        </div>
      </div>
    </div>
  );
}
