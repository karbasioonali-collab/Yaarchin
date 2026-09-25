import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, inArray } from "drizzle-orm";
import { ImportStars } from "@/components/site/ImportStars";
import { ActionForm } from "@/components/ui/ActionForm";
import ui from "@/components/ui/ui.module.css";
import { db } from "@/db/client";
import { activityLog, categories, products, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth/can";
import { fmtImportScore, IMPORT_SCORES, toImportScore } from "@/lib/catalog/import-score";
import { catalogReady, importScoreReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import styles from "../panel.module.css";
import { setImportScoreAction } from "./actions";

export const metadata: Metadata = { title: "محصولات" };

const PAGE = 30;
const STATUS_FA: Record<string, string> = { draft: "پیش‌نویس", published: "منتشرشده", archived: "بایگانی" };

// فعلاً فقط ثبت امتیاز «جذاب برای واردات». مدیریت کامل محصول در مرحله‌ی ۳.
export default async function ProductsAdminPage({ searchParams }: PageProps<"/admin/products">) {
  await requirePermission("products.rate");
  if (!(await catalogReady()) || !(await importScoreReady())) {
    return <div className={styles.impersonation}>جدول یا ستون لازم هنوز ساخته نشده است. در کنسول لیارا npm run db:migrate را اجرا کنید.</div>;
  }
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const where = q ? ilike(products.titleFa, `%${q}%`) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(products).where(where);
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      titleFa: products.titleFa,
      status: products.status,
      importScore: products.importScore,
      categoryName: categories.nameFa,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(where)
    .orderBy(desc(products.publishedAt), desc(products.createdAt))
    .limit(PAGE)
    .offset((page - 1) * PAGE);

  // آخرین تغییر امتیاز هر محصول (از لاگ فعالیت)
  const ids = rows.map((r) => r.id);
  const lastChanges = ids.length
    ? await db
        .selectDistinctOn([activityLog.entityId], {
          entityId: activityLog.entityId,
          at: activityLog.createdAt,
          before: activityLog.before,
          after: activityLog.after,
          actor: users.fullName,
        })
        .from(activityLog)
        .leftJoin(users, eq(users.id, activityLog.actorUserId))
        .where(and(eq(activityLog.action, "product.import_score"), eq(activityLog.entityType, "product"), inArray(activityLog.entityId, ids)))
        .orderBy(activityLog.entityId, desc(activityLog.createdAt))
    : [];
  const lastOf = new Map(lastChanges.map((c) => [c.entityId, c]));
  const scoreOf = (v: unknown) => toImportScore((v as { importScore?: unknown } | null)?.importScore ?? null);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => `?${new URLSearchParams({ ...(q && { q }), page: String(p) })}`;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>محصولات</h1>
          <p className={styles.pageSub}>
            امتیاز «جذاب برای واردات». فقط از بین {IMPORT_SCORES.map((x) => fmtImportScore(x)).join("، ")}؛ «بدون امتیاز» یعنی ستاره نمایش داده نمی‌شود. هر تغییر در لاگ فعالیت ثبت
            می‌شود.
          </p>
        </div>
      </div>

      <form className={styles.toolbar}>
        <input name="q" defaultValue={q} placeholder="جستجو در نام محصول" />
        <button type="submit" className={styles.btnGhost}>
          جستجو
        </button>
      </form>

      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>محصول</th>
                <th>دسته</th>
                <th>وضعیت</th>
                <th>امتیاز فعلی</th>
                <th>ثبت امتیاز</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const score = toImportScore(r.importScore);
                const last = lastOf.get(r.id);
                return (
                  <tr key={r.id}>
                    <td>
                      {r.status === "published" ? (
                        <Link href={`/p/${r.slug}`} target="_blank">
                          {r.titleFa}
                        </Link>
                      ) : (
                        r.titleFa
                      )}
                      {last && (
                        <div className={styles.muted} style={{ fontSize: 12, marginTop: 4 }}>
                          آخرین تغییر: {last.actor ?? "—"} · {fmtDateTime(last.at)} · {fmtImportScore(scoreOf(last.before))} ← {fmtImportScore(scoreOf(last.after))}
                        </div>
                      )}
                    </td>
                    <td className={styles.muted}>{r.categoryName ?? "—"}</td>
                    <td>
                      <span className={`${styles.badge} ${r.status !== "published" ? styles.badgeWarn : ""}`}>{STATUS_FA[r.status] ?? r.status}</span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {score === null ? <span className={styles.muted}>بدون امتیاز</span> : <ImportStars score={score} size={16} />}
                      {score !== null && <span className={styles.muted}> {fmtImportScore(score)}</span>}
                    </td>
                    <td>
                      <ActionForm action={setImportScoreAction} submitLabel="ذخیره" submitVariant="secondary" className={styles.scoreForm}>
                        <input type="hidden" name="id" value={r.id} />
                        <select name="score" defaultValue={score === null ? "" : String(score)} className={ui.select} aria-label={`امتیاز ${r.titleFa}`}>
                          <option value="">بدون امتیاز</option>
                          {IMPORT_SCORES.map((x) => (
                            <option key={x} value={String(x)}>
                              {fmtImportScore(x)}
                            </option>
                          ))}
                        </select>
                      </ActionForm>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.muted}>
                    محصولی پیدا نشد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {pages > 1 && (
        <div className={styles.pager}>
          {page > 1 && (
            <Link href={qs(page - 1)} className={styles.btnGhost}>
              قبلی
            </Link>
          )}
          <span className={styles.muted}>
            صفحه‌ی {fmtNum(page)} از {fmtNum(pages)}
          </span>
          {page < pages && (
            <Link href={qs(page + 1)} className={styles.btnGhost}>
              بعدی
            </Link>
          )}
        </div>
      )}
    </>
  );
}
