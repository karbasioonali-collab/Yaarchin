import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLog, categories, favorites, products, sessions, users } from "@/db/schema";
import { ActionForm } from "@/components/ui/ActionForm";
import { can, requirePermission } from "@/lib/auth/can";
import { hasCustomerRole } from "@/lib/customer/auth";
import { behaviorSummary } from "@/lib/customer/events";
import { BUSINESS_TYPE_FA, getProfile } from "@/lib/customer/profile";
import { customerReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { startImpersonationAction } from "../../users/actions";
import { setCustomerStatusAction } from "../actions";
import styles from "../../panel.module.css";

export const metadata: Metadata = { title: "مشتری" };

const UUID_RE = /^[0-9a-f-]{36}$/i;

// صفحه‌ی یک مشتری: اطلاعات، پروفایل کسب‌وکار، علاقه‌مندی‌ها، خلاصه‌ی رفتار (جدول events) و فعال/غیرفعال کردن.
export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const a = await requirePermission("customers.view");
  const { id } = await params;
  if (!UUID_RE.test(id) || !(await hasCustomerRole(id))) notFound();
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) notFound();

  const ready = await customerReady();
  const [profile, summary, favRows, activeSessions, history, canManage, canImpersonate] = await Promise.all([
    getProfile(id),
    behaviorSummary(id),
    ready
      ? db
          .select({ slug: products.slug, titleFa: products.titleFa, status: products.status, at: favorites.createdAt })
          .from(favorites)
          .innerJoin(products, eq(products.id, favorites.productId))
          .where(eq(favorites.userId, id))
          .orderBy(desc(favorites.createdAt))
      : Promise.resolve([]),
    db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()))),
    db
      .select({ log: activityLog, actorName: users.fullName })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.actorUserId))
      .where(or(eq(activityLog.entityId, id), eq(activityLog.actorUserId, id)))
      .orderBy(desc(activityLog.createdAt))
      .limit(10),
    can(a.user, "customers.manage"),
    can(a.user, "impersonate"),
  ]);

  // اسم دسته‌ها و محصولات (برای دسته‌های مورد علاقه و پربازدیدها)
  const catIds = [...new Set([...profile.interestIds, ...summary.topCategories.map((t) => t.id).filter((x): x is string => !!x)])];
  const prodIds = summary.topProducts.map((t) => t.id).filter((x): x is string => !!x);
  const [catRows, prodRows] = await Promise.all([
    catIds.length ? db.select({ id: categories.id, nameFa: categories.nameFa, slug: categories.slug }).from(categories).where(inArray(categories.id, catIds)) : [],
    prodIds.length ? db.select({ id: products.id, titleFa: products.titleFa, slug: products.slug }).from(products).where(inArray(products.id, prodIds)) : [],
  ]);
  const catOf = new Map(catRows.map((c) => [c.id, c]));
  const prodOf = new Map(prodRows.map((p) => [p.id, p]));
  const imp = profile.hasImportExperience === true ? "دارم" : profile.hasImportExperience === false ? "ندارم" : "—";
  const disabled = u.status !== "active";

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>
            {u.fullName} {disabled && <span className={`${styles.badge} ${styles.badgeWarn}`}>غیرفعال</span>}
          </h1>
          <p className={styles.pageSub}>
            <Link href="/admin/customers">مشتریان</Link> · ثبت‌نام {fmtDateTime(u.createdAt)} · آخرین ورود {fmtDateTime(u.lastLoginAt)}
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>اطلاعات</h2>
          <table className={styles.table}>
            <tbody>
              <tr>
                <td className={styles.muted}>موبایل</td>
                <td>
                  <span className={styles.ltr}>{u.mobile ?? "—"}</span>
                  {u.mobileVerifiedAt && <span className={styles.badge} style={{ marginInlineStart: 6 }}>تأییدشده</span>}
                </td>
              </tr>
              <tr>
                <td className={styles.muted}>ایمیل</td>
                <td>
                  <span className={styles.ltr}>{u.email ?? "—"}</span>
                </td>
              </tr>
              <tr>
                <td className={styles.muted}>وضعیت</td>
                <td>{disabled ? "غیرفعال" : "فعال"}</td>
              </tr>
              <tr>
                <td className={styles.muted}>نشست‌های فعال</td>
                <td>{fmtNum(activeSessions.length)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>پروفایل کسب‌وکار</h2>
          {profile.updatedAt || profile.interestIds.length ? (
            <table className={styles.table}>
              <tbody>
                <tr>
                  <td className={styles.muted}>نوع فعالیت</td>
                  <td>{profile.businessType ? BUSINESS_TYPE_FA[profile.businessType] : "—"}</td>
                </tr>
                <tr>
                  <td className={styles.muted}>شهر</td>
                  <td>{profile.city ?? "—"}</td>
                </tr>
                <tr>
                  <td className={styles.muted}>سابقه‌ی واردات</td>
                  <td>{imp}</td>
                </tr>
                <tr>
                  <td className={styles.muted}>دسته‌های مورد علاقه</td>
                  <td>
                    {profile.interestIds.length
                      ? profile.interestIds.map((cid) => (
                          <span key={cid} className={styles.badge}>
                            {catOf.get(cid)?.nameFa ?? "؟"}
                          </span>
                        ))
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>{ready ? "هنوز پر نشده است." : "بعد از اجرای migration ۰۰۰۳ نمایش داده می‌شود."}</p>
          )}
        </div>

        <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
          <h2 className={styles.cardTitle}>خلاصه‌ی بازدیدها و رفتار</h2>
          <div className={styles.stats}>
            {[
              [summary.views7, "بازدید محصول (۷ روز)"],
              [summary.views30, "بازدید محصول (۳۰ روز)"],
              [summary.distinctProducts, "محصول متفاوت دیده‌شده"],
              [summary.catViews30, "بازدید دسته (۳۰ روز)"],
              [summary.visits30, "روزهای ورود به سایت (۳۰ روز)"],
              [summary.logins, "ورود به حساب (کل)"],
              [summary.favAdds, "افزودن به علاقه‌مندی"],
              [summary.favRemoves, "حذف از علاقه‌مندی"],
            ].map(([n, label]) => (
              <div key={label as string} className={styles.stat}>
                <div className={styles.statValue}>{fmtNum(n as number)}</div>
                <div className={styles.statLabel}>{label}</div>
              </div>
            ))}
          </div>
          <p className={styles.muted}>آخرین فعالیت در سایت: {fmtDateTime(summary.lastSeenAt)}</p>
          <div className={styles.grid}>
            <div>
              <h3 className={styles.cardTitle} style={{ fontSize: 15 }}>
                پربازدیدترین محصولات
              </h3>
              {summary.topProducts.length ? (
                <table className={styles.table}>
                  <tbody>
                    {summary.topProducts.map((t) => {
                      const p = t.id ? prodOf.get(t.id) : undefined;
                      return (
                        <tr key={t.id}>
                          <td>{p ? <Link href={`/p/${p.slug}`} target="_blank">{p.titleFa}</Link> : "محصول حذف‌شده"}</td>
                          <td>{fmtNum(t.n)} بار</td>
                          <td className={styles.muted}>{fmtDateTime(t.last)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className={styles.muted}>بازدیدی ثبت نشده.</p>
              )}
            </div>
            <div>
              <h3 className={styles.cardTitle} style={{ fontSize: 15 }}>
                پربازدیدترین دسته‌ها
              </h3>
              {summary.topCategories.length ? (
                <table className={styles.table}>
                  <tbody>
                    {summary.topCategories.map((t) => {
                      const c = t.id ? catOf.get(t.id) : undefined;
                      return (
                        <tr key={t.id}>
                          <td>{c ? <Link href={`/c/${c.slug}`} target="_blank">{c.nameFa}</Link> : "دسته‌ی حذف‌شده"}</td>
                          <td>{fmtNum(t.n)} بار</td>
                          <td className={styles.muted}>{fmtDateTime(t.last)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className={styles.muted}>بازدیدی ثبت نشده.</p>
              )}
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>علاقه‌مندی‌ها ({fmtNum(favRows.length)})</h2>
          {favRows.length ? (
            <table className={styles.table}>
              <tbody>
                {favRows.map((f) => (
                  <tr key={f.slug}>
                    <td>
                      <Link href={`/p/${f.slug}`} target="_blank">
                        {f.titleFa}
                      </Link>
                      {f.status !== "published" && <span className={`${styles.badge} ${styles.badgeWarn}`} style={{ marginInlineStart: 6 }}>منتشر نشده</span>}
                    </td>
                    <td className={styles.muted}>{fmtDateTime(f.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>محصولی ذخیره نکرده است.</p>
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>وضعیت حساب</h2>
          {canManage ? (
            disabled ? (
              <ActionForm action={setCustomerStatusAction} submitLabel="فعال کردن مشتری">
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="status" value="active" />
                <p className={styles.muted} style={{ margin: 0 }}>
                  این مشتری غیرفعال است و نمی‌تواند وارد شود.
                </p>
              </ActionForm>
            ) : (
              <ActionForm
                action={setCustomerStatusAction}
                submitLabel="غیرفعال کردن مشتری"
                submitVariant="danger"
                confirm="این مشتری غیرفعال شود؟ از همه‌ی دستگاه‌ها خارج می‌شود و دیگر نمی‌تواند وارد شود."
              >
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="status" value="disabled" />
                <p className={styles.muted} style={{ margin: 0 }}>
                  با غیرفعال کردن، مشتری از همه‌ی دستگاه‌ها خارج می‌شود و تا فعال شدن دوباره نمی‌تواند وارد شود.
                </p>
              </ActionForm>
            )
          ) : (
            <p className={styles.muted}>{disabled ? "غیرفعال" : "فعال"} (تغییرش دسترسی «فعال یا غیرفعال کردن مشتری» می‌خواهد)</p>
          )}
        </div>

        {canImpersonate && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>دیدن به‌جای این مشتری</h2>
            <p className={styles.muted} style={{ marginTop: 0 }}>
              ادمین سایت را همان‌طور که این مشتری می‌بیند، می‌بیند. همه‌ی کارها در لاگ ثبت می‌شود.
            </p>
            <ActionForm action={startImpersonationAction} submitLabel="شروع" submitVariant="secondary">
              <input type="hidden" name="id" value={u.id} />
            </ActionForm>
          </div>
        )}

        <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
          <h2 className={styles.cardTitle}>تاریخچه‌ی تغییرات حساب</h2>
          {history.length ? (
            <table className={styles.table}>
              <tbody>
                {history.map(({ log, actorName }) => (
                  <tr key={log.id}>
                    <td>{actorName ?? "سیستم"}</td>
                    <td className={styles.mono}>{log.action}</td>
                    <td className={styles.muted}>{fmtDateTime(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>تغییری ثبت نشده.</p>
          )}
        </div>
      </div>
    </>
  );
}
