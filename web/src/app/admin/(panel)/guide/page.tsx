import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requirePermission } from "@/lib/auth/can";
import { type Block, type Inline, parseGuide } from "@/lib/guide/markdown";
import styles from "../panel.module.css";
import g from "./guide.module.css";

// صفحه‌ی «آموزش» پنل (دسترسی guide.view). متن در web/content/admin-guide.md است و هر بار خوانده می‌شود؛
// برای ویرایش متن فقط همان فایل عوض می‌شود. docs/infoyaarchin.md بخش ۴۲.
// در خروجی standalone فایل با outputFileTracingIncludes در next.config.js کپی می‌شود (verify-standalone چک می‌کند).
export const metadata: Metadata = { title: "آموزش" };

const Text = ({ t }: { t: Inline }) => <>{t.map((x, i) => (x.bold ? <strong key={i}>{x.text}</strong> : <span key={i}>{x.text}</span>))}</>;

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        b.type === "p" ? (
          <p key={i} className={g.p}>
            <Text t={b.text} />
          </p>
        ) : b.type === "h3" ? (
          <h3 key={i} className={g.h3}>
            <Text t={b.text} />
          </h3>
        ) : b.type === "ul" ? (
          <ul key={i} className={g.list}>
            {b.items.map((it, k) => (
              <li key={k}>
                <Text t={it} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i} className={g.list}>
            {b.items.map((it, k) => (
              <li key={k}>
                <Text t={it} />
              </li>
            ))}
          </ol>
        ),
      )}
    </>
  );
}

export default async function GuidePage() {
  await requirePermission("guide.view");
  const guide = parseGuide(await readFile(path.join(process.cwd(), "content", "admin-guide.md"), "utf8"));
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{guide.title || "آموزش"}</h1>
        </div>
      </div>
      <div className={`${styles.card} ${g.body}`}>
        <Blocks blocks={guide.intro} />
        <nav aria-label="فهرست بخش‌ها" data-testid="guide-toc">
          <h2 className={g.tocTitle}>فهرست بخش‌ها</h2>
          <ol className={g.toc}>
            {guide.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>
      </div>
      {guide.sections.map((s) => (
        <section key={s.id} id={s.id} className={`${styles.card} ${g.body} ${g.section}`} data-testid="guide-section">
          <h2 className={g.h2}>{s.title}</h2>
          <Blocks blocks={s.blocks} />
          <a href="#" className={g.top}>
            ↑ بالای صفحه
          </a>
        </section>
      ))}
    </>
  );
}
