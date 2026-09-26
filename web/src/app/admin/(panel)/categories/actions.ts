"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { categories, products } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/can";
import { httpsUrl, num, optStr, SLUG_RE, str } from "@/lib/catalog/admin-input";
import { adminCategoryTree, subtree } from "@/lib/catalog/admin-tree";

// مدیریت دسته‌ها (دسترسی categories.manage). همه‌ی تغییرات در لاگ فعالیت.
const UUID = /^[0-9a-f-]{36}$/i;

type Input = {
  nameFa: string;
  nameEn: string | null;
  slug: string;
  parentId: string | null;
  descriptionFa: string | null;
  image: string | null;
  sortOrder: number;
  status: "active" | "hidden";
};

async function read(fd: FormData, selfId?: string, currentImage?: string | null): Promise<{ error: string } | { v: Input }> {
  const nameFa = str(fd, "nameFa", 120);
  const slug = str(fd, "slug", 80).toLowerCase();
  const parentRaw = str(fd, "parentId", 40);
  const imageRaw = str(fd, "image", 1000);
  const sort = num(fd.get("sortOrder"));
  if (nameFa.length < 2) return { error: "نام فارسی را وارد کنید." };
  if (!SLUG_RE.test(slug)) return { error: "slug فقط حروف کوچک انگلیسی، عدد و خط تیره (مثل led-lighting)." };
  // مقدار فعلی (مثلاً کلید storage دسته‌های demo مثل demo/categories/x.svg) بدون تغییر پذیرفته می‌شود
  const keepImage = !!imageRaw && imageRaw === currentImage;
  if (imageRaw && !keepImage && !httpsUrl(imageRaw)) return { error: "آدرس عکس باید با https:// شروع شود." };
  if (sort !== null && (Number.isNaN(sort) || !Number.isInteger(sort))) return { error: "ترتیب نمایش باید عدد صحیح باشد." };
  const parentId = parentRaw && UUID.test(parentRaw) ? parentRaw : null;
  if (parentRaw && !parentId) return { error: "دسته‌ی والد نامعتبر است." };
  if (parentId) {
    const tree = await adminCategoryTree();
    if (!tree.some((c) => c.id === parentId)) return { error: "دسته‌ی والد پیدا نشد." };
    // جلوگیری از حلقه: والد نباید خودش یا یکی از زیرشاخه‌هایش باشد
    if (selfId && subtree(tree, selfId).has(parentId)) return { error: "یک دسته نمی‌تواند زیرمجموعه‌ی خودش یا زیرشاخه‌هایش شود." };
  }
  const [dup] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(selfId ? and(eq(categories.slug, slug), ne(categories.id, selfId)) : eq(categories.slug, slug));
  if (dup) return { error: "این slug قبلاً برای دسته‌ی دیگری استفاده شده است." };
  return {
    v: {
      nameFa,
      nameEn: optStr(fd, "nameEn", 120),
      slug,
      parentId,
      descriptionFa: optStr(fd, "descriptionFa", 1000),
      image: keepImage ? imageRaw : imageRaw ? httpsUrl(imageRaw) : null,
      sortOrder: sort ?? 0,
      status: fd.get("status") === "hidden" ? "hidden" : "active",
    },
  };
}

export async function createCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("categories.manage");
  const r = await read(fd);
  if ("error" in r) return r;
  const [row] = await db.insert(categories).values(r.v).returning({ id: categories.id });
  await logActivity({ actorUserId: a.user.id, action: "category.create", entityType: "category", entityId: row.id, after: r.v });
  revalidatePath("/", "layout");
  redirect(`/admin/categories/${row.id}`);
}

export async function updateCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("categories.manage");
  const id = str(fd, "id", 40);
  if (!UUID.test(id)) return { error: "دسته نامعتبر است." };
  const [before] = await db.select().from(categories).where(eq(categories.id, id));
  if (!before) return { error: "دسته پیدا نشد." };
  const r = await read(fd, id, before.image);
  if ("error" in r) return r;
  await db.update(categories).set(r.v).where(eq(categories.id, id));
  await logActivity({
    actorUserId: a.user.id,
    action: "category.update",
    entityType: "category",
    entityId: id,
    before: {
      nameFa: before.nameFa,
      nameEn: before.nameEn,
      slug: before.slug,
      parentId: before.parentId,
      descriptionFa: before.descriptionFa,
      image: before.image,
      sortOrder: before.sortOrder,
      status: before.status,
    },
    after: r.v,
  });
  revalidatePath("/", "layout");
  return { ok: "ذخیره شد." };
}

// جابه‌جایی بین هم‌سطح‌ها (بالا/پایین): ترتیب همه‌ی هم‌سطح‌ها از نو ۱، ۲، ۳… می‌شود
export async function moveCategoryAction(fd: FormData): Promise<void> {
  const a = await requirePermission("categories.manage");
  const id = str(fd, "id", 40);
  const dir = fd.get("dir") === "up" ? -1 : 1;
  const tree = await adminCategoryTree();
  const me = tree.find((c) => c.id === id);
  if (!me) return;
  const siblings = tree.filter((c) => c.parentId === me.parentId);
  const i = siblings.findIndex((c) => c.id === id);
  const j = i + dir;
  if (j < 0 || j >= siblings.length) return;
  [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
  await db.transaction(async (tx) => {
    for (const [k, c] of siblings.entries())
      await tx
        .update(categories)
        .set({ sortOrder: k + 1 })
        .where(eq(categories.id, c.id));
  });
  await logActivity({ actorUserId: a.user.id, action: "category.reorder", entityType: "category", entityId: id, after: { order: siblings.map((c) => c.slug) } });
  revalidatePath("/", "layout");
}

// حذف امن: زیرشاخه دارد ← اول باید جابه‌جا شوند. محصول دارد ← فقط با تأیید (محصولات بی‌دسته می‌شوند).
// دسته‌ی کارخانه‌ها و «دسته‌های مورد علاقه»ی مشتری‌ها با حذف دسته خودکار پاک می‌شوند (cascade).
export async function deleteCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("categories.manage");
  const id = str(fd, "id", 40);
  if (!UUID.test(id)) return { error: "دسته نامعتبر است." };
  const [c] = await db.select().from(categories).where(eq(categories.id, id));
  if (!c) return { error: "دسته پیدا نشد." };
  const [[kids], [prods]] = await Promise.all([
    db.select({ n: count() }).from(categories).where(eq(categories.parentId, id)),
    db.select({ n: count() }).from(products).where(eq(products.categoryId, id)),
  ]);
  if (kids.n > 0) return { error: `این دسته ${kids.n.toLocaleString("fa-IR")} زیرشاخه دارد. اول زیرشاخه‌ها را به دسته‌ی دیگری منتقل یا حذف کنید.` };
  if (prods.n > 0 && fd.get("confirmProducts") !== "yes") {
    return { error: `${prods.n.toLocaleString("fa-IR")} محصول در این دسته است و با حذف، بی‌دسته می‌شوند. برای ادامه، تیک تأیید را بزنید.` };
  }
  await db.delete(categories).where(eq(categories.id, id));
  await logActivity({
    actorUserId: a.user.id,
    action: "category.delete",
    entityType: "category",
    entityId: id,
    before: { nameFa: c.nameFa, slug: c.slug, parentId: c.parentId, productsUncategorized: prods.n },
  });
  revalidatePath("/", "layout");
  redirect("/admin/categories");
}
