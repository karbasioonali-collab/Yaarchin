import "server-only";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, products } from "@/db/schema";

// درخت کامل دسته‌ها برای پنل (همراه مخفی‌ها)، به ترتیب نمایش و با عمق — برای فهرست و منوی «والد».
export type AdminCategory = {
  id: string;
  parentId: string | null;
  slug: string;
  nameFa: string;
  nameEn: string | null;
  descriptionFa: string | null;
  image: string | null;
  sortOrder: number;
  status: "active" | "hidden";
  source: string;
  depth: number;
  // تعداد محصولاتی که مستقیم در همین دسته‌اند (نه زیرشاخه‌ها)
  productCount: number;
  childCount: number;
};

export async function adminCategoryTree(): Promise<AdminCategory[]> {
  const rows = await db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      slug: categories.slug,
      nameFa: categories.nameFa,
      nameEn: categories.nameEn,
      descriptionFa: categories.descriptionFa,
      image: categories.image,
      sortOrder: categories.sortOrder,
      status: categories.status,
      source: categories.source,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.nameFa));
  const counts = await db.select({ id: products.categoryId, n: count() }).from(products).groupBy(products.categoryId);
  const countOf = new Map(counts.map((c) => [c.id, c.n]));
  const kids = new Map<string | null, typeof rows>();
  for (const r of rows) kids.set(r.parentId, [...(kids.get(r.parentId) ?? []), r]);
  const out: AdminCategory[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const r of kids.get(parent) ?? []) {
      if (seen.has(r.id) || depth > 50) continue; // محافظ حلقه در داده‌ی خراب
      seen.add(r.id);
      out.push({ ...r, depth, productCount: countOf.get(r.id) ?? 0, childCount: (kids.get(r.id) ?? []).length });
      walk(r.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// خودش و همه‌ی نوادگانش (برای جلوگیری از اینکه دسته زیرمجموعه‌ی خودش شود)
export function subtree(tree: AdminCategory[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of tree) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

export const categoryLabel = (c: Pick<AdminCategory, "depth" | "nameFa">) => `${"— ".repeat(c.depth)}${c.nameFa}`;

export async function categoryExists(id: string): Promise<boolean> {
  const [r] = await db.select({ n: count() }).from(categories).where(eq(categories.id, id));
  return r.n > 0;
}
