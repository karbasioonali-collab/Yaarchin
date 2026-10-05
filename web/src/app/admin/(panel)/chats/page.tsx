import type { Metadata } from "next";
import Link from "next/link";
import { requireAnyPermission } from "@/lib/auth/can";
import { adminCategoryTree, categoryLabel, subtree } from "@/lib/catalog/admin-tree";
import { CHAT_PERMS, chatAccess } from "@/lib/chat/access";
import { type ChatFilters, chatCounters, listConversations } from "@/lib/chat/admin";
import { assignableStaff } from "@/lib/chat/service";
import { chatReady } from "@/lib/db-ready";
import { fmtDateTime, fmtNum } from "@/lib/format";
import styles from "../panel.module.css";
import c from "./chats.module.css";
import { NotifyBanner } from "./NotifyBanner";

export const metadata: Metadata = { title: "گفتگوها" };
const UUID = /^[0-9a-f-]{36}$/i;
const PAGE = 30;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
// تاریخ فیلد date (میلادی) = نیمه‌شب تهران (+03:30)
const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00+03:30`) : null);

// همه‌ی گفتگوهای مشتریان (یا فقط گفتگوهای ارجاع‌شده به من، برای کسی که فقط chats.reply دارد) با فیلتر و جستجو.
export default async function ChatsPage({ searchParams }: PageProps<"/admin/chats">) {
  const a = await requireAnyPermission(CHAT_PERMS);
  if (!(await chatReady())) {
    return (
      <div className={styles.impersonation}>
        جدول‌های گفتگو (migration ۰۰۰۶) هنوز ساخته نشده‌اند. در کنسول لیارا اول بکاپ بگیرید، بعد npm run db:migrate و npm run db:seed را اجرا کنید.
      </div>
    );
  }
  const access = await chatAccess(a.user);
  const sp = await searchParams;
  const defTab = access.assign ? "unassigned" : access.viewAll ? "all" : "mine";
  const tabRaw = one(sp.tab);
  const tab = (access.viewAll && (tabRaw === "unassigned" || tabRaw === "all" || tabRaw === "mine") ? tabRaw : access.viewAll ? defTab : "mine") as ChatFilters["tab"];
  const tree = await adminCategoryTree();
  const catRaw = one(sp.category);
  const status = one(sp.status) === "closed" ? "closed" : one(sp.status) === "any" ? "any" : "open";
  const toDay = day(one(sp.to));
  const f: ChatFilters = {
    tab,
    expert: UUID.test(one(sp.expert)) ? one(sp.expert) : "",
    category: catRaw === "general" ? ["general"] : UUID.test(catRaw) ? [...subtree(tree, catRaw)] : [],
    status,
    from: day(one(sp.from)),
    to: toDay ? new Date(toDay.getTime() + 86400000) : null,
    q: one(sp.q).trim().slice(0, 60),
  };
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [{ rows, total }, counters, staff] = await Promise.all([
    listConversations(access, f, page, PAGE),
    chatCounters(access),
    access.viewAll ? assignableStaff() : Promise.resolve([]),
  ]);
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab, expert: f.expert, category: catRaw, status, from: one(sp.from), to: one(sp.to), q: f.q, ...patch })) if (v) p.set(k, v);
    return `?${p}`;
  };

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>گفتگوها</h1>
          <p className={styles.pageSub}>گفتگوی تازه در صف «ارجاع‌نشده» می‌نشیند و ارجاع همیشه دستی است. فقط کارشناس ارجاع‌گرفته (و ادمین) پاسخ می‌دهد.</p>
        </div>
        {access.assign && (
          <Link href="/admin/chats/settings" className={styles.btnGhost}>
            تنظیمات گفتگو
          </Link>
        )}
      </div>

      <NotifyBanner />

      {access.viewAll && (
        <nav className={styles.tabs} aria-label="صف‌ها">
          {(
            [
              ["unassigned", "ارجاع‌نشده", counters.unassigned],
              ["mine", "گفتگوهای من", counters.mine],
              ["all", "همه", 0],
            ] as const
          ).map(([k, label, n]) => (
            <Link key={k} href={qs({ tab: k, page: "" })} className={`${styles.tab} ${tab === k ? styles.tabActive : ""}`} aria-current={tab === k ? "page" : undefined}>
              {label} {n > 0 && <span className={c.unread}>{fmtNum(n)}</span>}
            </Link>
          ))}
        </nav>
      )}

      <div className={styles.card}>
        <form method="get" className={c.filters}>
          <input type="hidden" name="tab" value={tab} />
          <label>
            جستجو (نام یا موبایل مشتری)
            <input name="q" defaultValue={f.q} placeholder="مثلاً ۰۹۱۲… یا نام" />
          </label>
          {access.viewAll && (
            <label>
              کارشناس
              <select name="expert" defaultValue={f.expert}>
                <option value="">همه</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            دسته‌بندی محصول
            <select name="category" defaultValue={catRaw}>
              <option value="">همه</option>
              <option value="general">— گفتگوی عمومی (بدون محصول) —</option>
              {tree.map((t) => (
                <option key={t.id} value={t.id}>
                  {categoryLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <label>
            وضعیت
            <select name="status" defaultValue={status}>
              <option value="open">باز</option>
              <option value="closed">بسته</option>
              <option value="any">همه</option>
            </select>
          </label>
          <label>
            آخرین پیام از (میلادی)
            <input type="date" name="from" defaultValue={one(sp.from)} dir="ltr" />
          </label>
          <label>
            تا
            <input type="date" name="to" defaultValue={one(sp.to)} dir="ltr" />
          </label>
          <button type="submit" className={styles.btn}>
            فیلتر
          </button>
        </form>

        <p className={styles.muted} style={{ fontSize: 13, marginTop: 0 }}>
          {fmtNum(total)} گفتگو
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>مشتری</th>
                <th>محصول / موضوع</th>
                <th>کارشناس</th>
                <th>آخرین پیام</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.unread > 0 ? c.rowUnread : undefined}>
                  <td>
                    <Link href={`/admin/chats/${r.id}`}>{r.customerName}</Link>
                    {r.customerMobile && (
                      <div className={`${styles.muted} ${styles.ltr}`} style={{ fontSize: 12 }}>
                        {r.customerMobile}
                      </div>
                    )}
                  </td>
                  <td>
                    {r.kind === "general" ? (
                      <>
                        <span className={`${styles.badge} ${styles.badgeWarn}`}>عمومی</span> {r.subject}
                      </>
                    ) : (
                      (r.productTitle ?? "محصول حذف‌شده")
                    )}
                    {r.categoryName && (
                      <div className={styles.muted} style={{ fontSize: 12 }}>
                        {r.categoryName}
                      </div>
                    )}
                    {r.preview && <div className={c.preview}>{r.preview}</div>}
                  </td>
                  <td>{r.expertName ?? <span className={`${styles.badge} ${styles.badgeWarn}`}>ارجاع‌نشده</span>}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                    {fmtDateTime(r.lastMessageAt)}
                    {r.status === "closed" && (
                      <div>
                        <span className={`${styles.badge} ${styles.badgeMuted}`}>بسته</span>
                      </div>
                    )}
                    {r.attention && (
                      <div>
                        <span className={`${styles.badge} ${styles.badgeWarn}`}>{r.attention === "needs_expert" ? "نیاز به کارشناس" : "نیاز به بررسی"}</span>
                      </div>
                    )}
                  </td>
                  <td>
                    {r.unread > 0 && (
                      <span className={c.unread} aria-label={`${fmtNum(r.unread)} پیام خوانده‌نشده`}>
                        {fmtNum(r.unread)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className={styles.muted}>گفتگویی با این فیلترها نیست.</p>}
        {total > PAGE && (
          <div className={styles.pager}>
            {page > 1 && <Link href={qs({ page: String(page - 1) })}>← قبلی</Link>}
            <span className={styles.muted}>
              صفحه‌ی {fmtNum(page)} از {fmtNum(Math.ceil(total / PAGE))}
            </span>
            {page * PAGE < total && <Link href={qs({ page: String(page + 1) })}>بعدی →</Link>}
          </div>
        )}
      </div>
    </>
  );
}
