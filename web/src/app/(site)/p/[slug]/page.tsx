import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/site/Gallery";
import { Icon } from "@/components/site/Icon";
import { ImportStars } from "@/components/site/ImportStars";
import { ChatBox, ChatButton, FavoriteButton, MobileProductBar } from "@/components/site/ProductActions";
import { ProductGrid } from "@/components/site/ProductCard";
import s from "@/components/site/site.module.css";
import { getCategoryPage, getProduct, listProducts, publishedProductId, type PublicProduct } from "@/lib/catalog/public";
import { getAuth } from "@/lib/auth/current";
import { toCustomerMsg } from "@/lib/chat/dto";
import { customerProductConversation, markRead, messagesOf } from "@/lib/chat/service";
import { getCustomer } from "@/lib/customer/auth";
import { chatReady } from "@/lib/db-ready";
import { isFavorite } from "@/lib/customer/favorites";
import { fmtDate, fmtMoney, fmtNum, unitFa } from "@/lib/format";
import { isEnabled } from "@/lib/settings";
import { LandedCalculator } from "./LandedCalculator";
import styles from "./product.module.css";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  if (!p) return {};
  return { title: p.titleFa, description: p.summaryFa ?? undefined, openGraph: p.coverUrl ? { images: [p.coverUrl] } : undefined };
}

function PriceCard({ p }: { p: PublicProduct }) {
  const pr = p.price;
  if (!pr) {
    return (
      <div className={styles.priceCard}>
        <div className={styles.priceHead}>قیمت کارخانه</div>
        <p className={styles.muted}>قیمت این محصول هنوز استعلام نشده است. برای استعلام پیام بدهید.</p>
      </div>
    );
  }
  const span = pr.max - pr.min;
  const pos = span > 0 ? ((pr.avg - pr.min) / span) * 100 : 50;
  return (
    <div className={styles.priceCard}>
      <div className={styles.priceHead}>
        قیمت کارخانه در چین
        <span className={styles.priceUnit}>هر {unitFa(pr.unit)}</span>
      </div>
      <div className={styles.avgRow}>
        <span className={styles.avgLabel}>میانگین</span>
        <span className={styles.avg}>
          {fmtMoney(pr.avg)} <small>دلار</small>
        </span>
      </div>
      <div className={styles.range} aria-label={`بازه‌ی قیمت از ${fmtMoney(pr.min)} تا ${fmtMoney(pr.max)} دلار`}>
        <div className={styles.rangeBar}>
          <span className={styles.rangeMarker} style={{ insetInlineStart: `${Math.min(96, Math.max(4, pos))}%` }} />
        </div>
        <div className={styles.rangeLabels}>
          <span>
            کمترین <strong>{fmtMoney(pr.min)}</strong>
          </span>
          <span>
            بیشترین <strong>{fmtMoney(pr.max)}</strong>
          </span>
        </div>
      </div>
      <p className={styles.priceNote}>
        بر اساس آخرین قیمت {fmtNum(pr.pricedSuppliers)} کارخانه، به‌روز شده در {fmtDate(pr.lastObservedAt)}. قیمت نهایی به تعداد سفارش بستگی دارد.
      </p>
    </div>
  );
}

function LandedCard({ p }: { p: PublicProduct }) {
  const lc = p.landedCost;
  return (
    <div className={styles.landed}>
      <div className={styles.landedHead}>
        <Icon name="truck" size={20} />
        قیمت تمام‌شده تا ایران
        {lc.status !== "ready" && <span className={`${s.chip} ${s.chipOrange}`}>به‌زودی</span>}
      </div>
      {lc.status === "ready" ? (
        <LandedCalculator slug={p.slug} unit={p.price?.unit ?? "piece"} initial={lc} />
      ) : (
        <p className={styles.priceNote}>
          به‌زودی قیمت رسیده به ایران (با حمل، بیمه، حقوق ورودی، مالیات و نرخ روز ارز) برای هر روش حمل اینجا نمایش داده می‌شود.
        </p>
      )}
    </div>
  );
}

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const p = await getProduct((await params).slug);
  if (!p) notFound();
  // چت فقط وقتی سوئیچ features.chat روشن و migration ۰۰۰۶ اجرا شده باشد (دکمه، باکس و نوار موبایل با هم)
  const [chatSwitch, chatTables, favOn, customer, auth] = await Promise.all([isEnabled("chat"), chatReady(), isEnabled("favorites"), getCustomer(), getAuth()]);
  const chatOn = chatSwitch && chatTables;
  // وضعیت قلب برای مشتری واردشده (برای بقیه خالی)
  const productId = (favOn || chatOn) && customer ? await publishedProductId(p.slug) : null;
  const fav = favOn && customer && productId ? await isFavorite(customer.user.id, productId) : false;
  // گفتگوی همین محصول برای مشتری (با سابقه؛ تا اینجا خوانده‌شده حساب می‌شود)
  const conv = chatOn && customer && productId ? await customerProductConversation(customer.user.id, productId) : null;
  const convMsgs = conv ? await messagesOf(conv.id, { forCustomer: true }) : [];
  if (conv && customer) await markRead(conv.id, customer.user.id, convMsgs.at(-1)?.id ?? 0);
  const viewer = customer ? "customer" : auth?.user.isStaff ? "staff" : "guest";
  const last = p.breadcrumb.at(-1);
  const catPage = last ? await getCategoryPage(last.slug) : null;
  const related = catPage ? await listProducts({ categoryIds: catPage.ids, limit: 4, excludeSlug: p.slug }) : [];

  return (
    <div className={s.container}>
      <nav className={s.breadcrumb} aria-label="مسیر">
        <Link href="/">خانه</Link>
        {p.breadcrumb.map((b) => (
          <span key={b.slug} style={{ display: "contents" }}>
            <span className={s.breadcrumbSep}>/</span>
            <Link href={`/c/${b.slug}`}>{b.nameFa}</Link>
          </span>
        ))}
      </nav>

      <div className={styles.top}>
        <div className={styles.galleryCol}>
          <Gallery media={p.media} title={p.titleFa} />
        </div>

        <div className={styles.info}>
          {p.categoryName && <span className={s.chip}>{p.categoryName}</span>}
          <h1 className={styles.title}>{p.titleFa}</h1>
          {p.importScore !== null && (
            <div className={styles.importScore}>
              <span>جذاب برای واردات</span>
              <ImportStars score={p.importScore} size={20} />
            </div>
          )}
          {p.titleEn && (
            <p className={`${styles.titleEn} ${s.ltr}`} lang="en" dir="ltr">
              {p.titleEn}
            </p>
          )}
          {p.summaryFa && <p className={styles.summary}>{p.summaryFa}</p>}

          <ul className={styles.facts}>
            {p.suppliers > 0 && (
              <li>
                <Icon name="factory" size={18} />
                {fmtNum(p.suppliers)} کارخانه‌ی بررسی‌شده
              </li>
            )}
            {p.moqMin != null && (
              <li>
                <Icon name="box" size={18} />
                حداقل سفارش از {fmtNum(p.moqMin)} {unitFa(p.price?.unit ?? "piece")}
              </li>
            )}
            {p.leadTimeDays && (
              <li>
                <Icon name="clock" size={18} />
                آماده‌سازی{" "}
                {p.leadTimeDays.min === p.leadTimeDays.max
                  ? `${fmtNum(p.leadTimeDays.min)} روز`
                  : `${fmtNum(p.leadTimeDays.min)} تا ${fmtNum(p.leadTimeDays.max)} روز`}
              </li>
            )}
          </ul>

          <PriceCard p={p} />
          <LandedCard p={p} />

          <div className={styles.actions}>
            {chatOn && <ChatButton />}
            {favOn && <FavoriteButton slug={p.slug} initial={fav} />}
          </div>
          <p className={styles.trust}>
            <Icon name="shield" size={16} />
            اطلاعات کارخانه‌ها محرمانه است؛ خرید و مذاکره از طریق کارشناس یارچین انجام می‌شود.
          </p>
        </div>
      </div>

      <div className={styles.details}>
        <div className={styles.detailsMain}>
          {p.specs.length > 0 && (
            <section className={styles.block} aria-labelledby="specs">
              <h2 id="specs" className={styles.blockTitle}>
                مشخصات مشترک
              </h2>
              <dl className={styles.specs}>
                {p.specs.map((sp) => (
                  <div key={sp.label} className={styles.specRow}>
                    <dt>{sp.label}</dt>
                    <dd>{sp.value}</dd>
                  </div>
                ))}
              </dl>
              <p className={styles.muted}>مشخصاتی که بین کارخانه‌ها مشترک است. جزئیات هر مدل را در گفتگو بپرسید.</p>
            </section>
          )}
          {p.descriptionFa && (
            <section className={styles.block} aria-labelledby="desc">
              <h2 id="desc" className={styles.blockTitle}>
                توضیحات
              </h2>
              <p className={styles.description}>{p.descriptionFa}</p>
            </section>
          )}
        </div>
        {chatOn && (
          <div className={styles.detailsSide}>
            <ChatBox
              slug={p.slug}
              title={p.titleFa}
              viewer={viewer}
              conversation={conv ? { id: conv.id, status: conv.status } : null}
              initial={convMsgs.map(toCustomerMsg)}
            />
          </div>
        )}
      </div>

      {related.length > 0 && (
        <section className={s.section} aria-labelledby="related">
          <div className={s.sectionHead}>
            <h2 id="related" className={s.sectionTitle}>
              محصولات مشابه
            </h2>
          </div>
          <ProductGrid items={related} />
        </section>
      )}

      <MobileProductBar
        slug={p.slug}
        favorite={favOn}
        isFavorite={fav}
        chat={chatOn}
        price={p.price ? `${fmtMoney(p.price.min)} تا ${fmtMoney(p.price.max)} $` : null}
      />
    </div>
  );
}
