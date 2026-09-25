import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { PublicCategory } from "@/lib/catalog/public";
import type { FooterData } from "@/lib/site/blocks";
import { Icon } from "./Icon";
import styles from "./Footer.module.css";
import s from "./site.module.css";

type ProductLink = { slug: string; titleFa: string };

// نماد اعتماد الکترونیکی: فقط id و code از پنل می‌آید؛ HTML آن را خود سایت می‌سازد.
function Enamad({ id, code }: { id: string; code: string }) {
  if (!id || !code) {
    return (
      <div className={styles.sealPlaceholder} aria-label="جای نماد اعتماد الکترونیکی">
        <Icon name="shield" size={26} />
        <span>جای نماد اعتماد</span>
      </div>
    );
  }
  const q = `id=${encodeURIComponent(id)}&Code=${encodeURIComponent(code)}`;
  return (
    <a referrerPolicy="origin" target="_blank" rel="noopener" href={`https://trustseal.enamad.ir/?${q}`} className={styles.seal}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img referrerPolicy="origin" src={`https://trustseal.enamad.ir/logo.aspx?${q}`} alt="نماد اعتماد الکترونیکی" width={100} height={100} />
    </a>
  );
}

export function Footer({ data, categories, products }: { data: FooterData; categories: PublicCategory[]; products: ProductLink[] }) {
  const { about, links, contact, enamad, social, copyright } = data;
  const cats = data.categories.visible ? categories.slice(0, data.categories.limit) : [];
  const prods = data.products.visible ? products.slice(0, data.products.limit) : [];
  const year = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", timeZone: "Asia/Tehran" }).format(new Date());

  return (
    <footer className={styles.footer}>
      <div className={styles.wave} aria-hidden="true" />
      <div className={`${s.container} ${styles.grid}`}>
        <div className={styles.brandCol}>
          <Logo size="md" />
          {about.visible && about.text && <p className={styles.about}>{about.text}</p>}
          {social.visible && social.items.length > 0 && (
            <div className={styles.social}>
              {social.items.map((l) => (
                <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
                  {l.label}
                </a>
              ))}
            </div>
          )}
        </div>

        {cats.length > 0 && (
          <nav className={styles.col} aria-label={data.categories.title}>
            <h2 className={styles.colTitle}>{data.categories.title}</h2>
            <ul>
              {cats.map((c) => (
                <li key={c.slug}>
                  <Link href={`/c/${c.slug}`}>{c.nameFa}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {prods.length > 0 && (
          <nav className={styles.col} aria-label={data.products.title}>
            <h2 className={styles.colTitle}>{data.products.title}</h2>
            <ul>
              {prods.map((p) => (
                <li key={p.slug}>
                  <Link href={`/p/${p.slug}`}>{p.titleFa}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {links.visible && links.items.length > 0 && (
          <nav className={styles.col} aria-label={links.title}>
            <h2 className={styles.colTitle}>{links.title}</h2>
            <ul>
              {links.items.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {(contact.visible || enamad.visible) && (
          <div className={styles.col}>
            {contact.visible && (
              <>
                <h2 className={styles.colTitle}>{contact.title}</h2>
                <ul className={styles.contactList}>
                  {contact.address && (
                    <li>
                      <Icon name="pin" size={18} />
                      <span>{contact.address}</span>
                    </li>
                  )}
                  {contact.phone && (
                    <li>
                      <Icon name="phone" size={18} />
                      <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className={s.ltr}>
                        {contact.phone}
                      </a>
                    </li>
                  )}
                  {contact.email && (
                    <li>
                      <Icon name="mail" size={18} />
                      <a href={`mailto:${contact.email}`} className={s.ltr}>
                        {contact.email}
                      </a>
                    </li>
                  )}
                </ul>
              </>
            )}
            {enamad.visible && (
              <div className={styles.seals}>
                <Enamad id={enamad.id} code={enamad.code} />
              </div>
            )}
          </div>
        )}
      </div>
      {copyright.visible && (
        <div className={styles.bottom}>
          <div className={s.container}>
            © {year} — {copyright.text}
          </div>
        </div>
      )}
    </footer>
  );
}
