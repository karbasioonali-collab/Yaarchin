import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryBoxes } from "@/components/site/CategoryBoxes";
import { ProductGrid } from "@/components/site/ProductCard";
import s from "@/components/site/site.module.css";
import { getCategoryPage, listProducts } from "@/lib/catalog/public";
import { fmtNum } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const page = await getCategoryPage((await params).slug);
  return page ? { title: page.category.nameFa, description: page.category.descriptionFa ?? undefined } : {};
}

// صفحه‌ی هر دسته: زیرشاخه‌ها (به همان شکل باکس، پس عمق نامحدود) و محصولات خودش و همه‌ی زیرشاخه‌ها
export default async function CategoryPage({ params }: PageProps<"/c/[slug]">) {
  const page = await getCategoryPage((await params).slug);
  if (!page) notFound();
  const { category, breadcrumb, ids } = page;
  const items = await listProducts({ categoryIds: ids, limit: 60 });

  return (
    <div className={s.container}>
      <nav className={s.breadcrumb} aria-label="مسیر">
        <Link href="/">خانه</Link>
        {breadcrumb.map((b, i) => (
          <span key={b.slug} style={{ display: "contents" }}>
            <span className={s.breadcrumbSep}>/</span>
            {i === breadcrumb.length - 1 ? <span aria-current="page">{b.nameFa}</span> : <Link href={`/c/${b.slug}`}>{b.nameFa}</Link>}
          </span>
        ))}
      </nav>
      <header className={s.pageHead}>
        <h1 className={s.pageTitle}>{category.nameFa}</h1>
        {category.descriptionFa && <p className={s.pageLead}>{category.descriptionFa}</p>}
      </header>

      {category.children.length > 0 && (
        <section aria-label="زیرشاخه‌ها">
          <CategoryBoxes items={category.children} />
        </section>
      )}

      <section className={s.section} aria-labelledby="cat-products">
        <div className={s.sectionHead}>
          <h2 id="cat-products" className={s.sectionTitle}>
            محصولات {items.length > 0 && <small style={{ fontWeight: 500, fontSize: 14, color: "var(--muted)" }}>({fmtNum(items.length)})</small>}
          </h2>
        </div>
        {items.length ? <ProductGrid items={items} /> : <p className={s.empty}>محصولی در این دسته هنوز منتشر نشده است.</p>}
      </section>
    </div>
  );
}
