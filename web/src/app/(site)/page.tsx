import Link from "next/link";
import { CategoryBoxes } from "@/components/site/CategoryBoxes";
import { Icon, type IconName } from "@/components/site/Icon";
import { ProductGrid } from "@/components/site/ProductCard";
import { Slider } from "@/components/site/Slider";
import s from "@/components/site/site.module.css";
import { getCategoryTree, listProducts } from "@/lib/catalog/public";
import { getBlock } from "@/lib/site/get";
import { mediaUrl } from "@/lib/storage";
import styles from "./home.module.css";

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "factory", title: "چند کارخانه، یک صفحه", text: "قیمت و مشخصات هر محصول از چند تأمین‌کننده کنار هم." },
  { icon: "chat", title: "گفتگو و مشاوره", text: "سؤال بپرسید؛ دستیار و کارشناس یارچین پاسخ می‌دهند." },
  { icon: "truck", title: "تا رسیدن به ایران", text: "هزینه‌ی تمام‌شده، حمل و ترخیص را با شما پیش می‌بریم." },
];

export default async function HomePage() {
  const [slider, categories, latest] = await Promise.all([getBlock("home.slider"), getCategoryTree(), listProducts({ limit: 8 })]);
  const slides = slider.isVisible
    ? slider.data.slides
        .filter((x) => x.visible)
        .map((x) => ({ title: x.title, text: x.text, imageUrl: mediaUrl(x.image), href: x.href, cta: x.cta, tone: x.tone }))
    : [];

  return (
    <div className={s.container}>
      {slides.length > 0 && <Slider slides={slides} intervalSec={slider.data.intervalSec} />}

      {categories.length > 0 && (
        <section className={s.section} aria-labelledby="home-cats">
          <div className={s.sectionHead}>
            <div>
              <h2 id="home-cats" className={s.sectionTitle}>
                دسته‌بندی محصولات
              </h2>
              <p className={s.sectionSub}>از دسته‌ی اصلی شروع کنید و تا دقیق‌ترین شاخه پیش بروید.</p>
            </div>
            <Link href="/categories" className={s.sectionLink}>
              همه
              <Icon name="chevronLeft" size={16} />
            </Link>
          </div>
          <CategoryBoxes items={categories} />
        </section>
      )}

      <section className={`${s.section} ${styles.steps}`} aria-label="یارچین چطور کار می‌کند">
        {STEPS.map((st, i) => (
          <div key={st.title} className={styles.step}>
            <span className={`${styles.stepIcon} ${i === 1 ? styles.stepIconAlt : ""}`}>
              <Icon name={st.icon} size={24} />
            </span>
            <span>
              <strong className={styles.stepTitle}>{st.title}</strong>
              <span className={styles.stepText}>{st.text}</span>
            </span>
          </div>
        ))}
      </section>

      {latest.length > 0 && (
        <section className={s.section} aria-labelledby="home-latest">
          <div className={s.sectionHead}>
            <div>
              <h2 id="home-latest" className={s.sectionTitle}>
                محصولات تازه
              </h2>
              <p className={s.sectionSub}>میانگین و بازه‌ی قیمت، از آخرین استعلام کارخانه‌ها.</p>
            </div>
          </div>
          <ProductGrid items={latest} priorityCount={2} />
        </section>
      )}
    </div>
  );
}
