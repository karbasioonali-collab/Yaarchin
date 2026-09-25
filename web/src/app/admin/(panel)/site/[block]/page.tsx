import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/ActionForm";
import ui from "@/components/ui/ui.module.css";
import { requirePermission } from "@/lib/auth/can";
import { catalogReady } from "@/lib/db-ready";
import { fmtNum } from "@/lib/format";
import { type BlockMap, MAX_SLIDES } from "@/lib/site/blocks";
import { getBlock } from "@/lib/site/get";
import { mediaUrl } from "@/lib/storage";
import panel from "../../panel.module.css";
import { resetBlockAction, saveBlockAction } from "../actions";
import { BLOCK_PAGES } from "../blocks-meta";
import { Area, LinkRows, Num, Part, Show, Text } from "../fields";
import styles from "../site.module.css";

export async function generateMetadata({ params }: PageProps<"/admin/site/[block]">): Promise<Metadata> {
  const { block } = await params;
  const meta = BLOCK_PAGES.find((b) => b.slug === block);
  return { title: meta ? `محتوای سایت: ${meta.title}` : "محتوای سایت" };
}

function HeaderForm({ d }: { d: BlockMap["header"] }) {
  return (
    <>
      <Part title="نوار بالای هدر" visible={{ name: "topBar.visible", value: d.topBar.visible }}>
        <div className={styles.grid2}>
          <Text name="topBar.text" label="متن" value={d.topBar.text} max={160} />
          <Text name="topBar.phone" label="تلفن" value={d.topBar.phone} ltr max={40} />
        </div>
      </Part>
      <Part title="منوی دسته‌بندی‌ها" visible={{ name: "categoriesMenu.visible", value: d.categoriesMenu.visible }}>
        <Text name="categoriesMenu.label" label="عنوان دکمه" value={d.categoriesMenu.label} max={40} />
      </Part>
      <Part title="لینک‌های منو" visible={{ name: "nav.visible", value: d.nav.visible }}>
        <LinkRows name="nav.links" links={d.nav.links} />
      </Part>
      <Part title="دکمه‌های ورود و علاقه‌مندی" visible={{ name: "account.visible", value: d.account.visible }}>
        <span className={ui.hint}>آیکون علاقه‌مندی و «ورود» سمت چپ هدر.</span>
      </Part>
      <Part title="دکمه‌ی نارنجی هدر" visible={{ name: "cta.visible", value: d.cta.visible }}>
        <div className={styles.grid2}>
          <Text name="cta.label" label="متن دکمه" value={d.cta.label} max={40} />
          <Text name="cta.href" label="آدرس" value={d.cta.href} ltr max={500} />
        </div>
      </Part>
    </>
  );
}

function FooterForm({ d }: { d: BlockMap["footer"] }) {
  return (
    <>
      <Part title="درباره (کنار لوگو)" visible={{ name: "about.visible", value: d.about.visible }}>
        <Area name="about.text" label="متن" value={d.about.text} max={600} />
      </Part>
      <Part title="ستون دسته‌بندی‌ها" visible={{ name: "categories.visible", value: d.categories.visible }} hint="دسته‌های اصلی سایت، خودکار.">
        <div className={styles.grid2}>
          <Text name="categories.title" label="عنوان" value={d.categories.title} max={60} />
          <Num name="categories.limit" label="حداکثر تعداد" value={d.categories.limit} min={1} max={12} />
        </div>
      </Part>
      <Part title="ستون محصولات" visible={{ name: "products.visible", value: d.products.visible }} hint="تازه‌ترین محصولات منتشرشده، خودکار.">
        <div className={styles.grid2}>
          <Text name="products.title" label="عنوان" value={d.products.title} max={60} />
          <Num name="products.limit" label="حداکثر تعداد" value={d.products.limit} min={1} max={12} />
        </div>
      </Part>
      <Part title="ستون لینک‌ها" visible={{ name: "links.visible", value: d.links.visible }}>
        <Text name="links.title" label="عنوان" value={d.links.title} max={60} />
        <LinkRows name="links.items" links={d.links.items} />
      </Part>
      <Part title="اطلاعات تماس" visible={{ name: "contact.visible", value: d.contact.visible }}>
        <Text name="contact.title" label="عنوان" value={d.contact.title} max={60} />
        <Area name="contact.address" label="آدرس" value={d.contact.address} rows={2} max={300} />
        <div className={styles.grid2}>
          <Text name="contact.phone" label="تلفن" value={d.contact.phone} ltr max={40} />
          <Text name="contact.email" label="ایمیل" value={d.contact.email} ltr max={120} />
        </div>
      </Part>
      <Part
        title="نماد اعتماد الکترونیکی (اینماد)"
        visible={{ name: "enamad.visible", value: d.enamad.visible }}
        hint="از کد اینماد فقط دو مقدار id و Code را وارد کنید (در لینک نماد: ?id=…&Code=…). تا وقتی خالی است، جای نماد با کادر خط‌چین نشان داده می‌شود."
      >
        <div className={styles.grid2}>
          <Text name="enamad.id" label="id" value={d.enamad.id} ltr max={40} />
          <Text name="enamad.code" label="Code" value={d.enamad.code} ltr max={80} />
        </div>
      </Part>
      <Part title="شبکه‌های اجتماعی" visible={{ name: "social.visible", value: d.social.visible }}>
        <LinkRows name="social.items" links={d.social.items} rows={5} />
      </Part>
      <Part title="متن کپی‌رایت" visible={{ name: "copyright.visible", value: d.copyright.visible }}>
        <Text name="copyright.text" label="متن" value={d.copyright.text} />
      </Part>
    </>
  );
}

function SliderForm({ d }: { d: BlockMap["home.slider"] }) {
  const rows = [...d.slides, ...Array.from({ length: Math.max(0, MAX_SLIDES - d.slides.length) }, () => null)];
  return (
    <>
      <Part title="تنظیمات">
        <Num name="intervalSec" label="فاصله‌ی عوض شدن اسلاید (ثانیه)" value={d.intervalSec} min={3} max={20} />
        <span className={ui.hint}>پیشنهاد: ۵ تا ۷ اسلاید. اسلایدی که عنوان و عکس ندارد ذخیره نمی‌شود.</span>
      </Part>
      {rows.map((sl, i) => {
        const url = sl ? mediaUrl(sl.image) : null;
        return (
          <Part key={i} title={`اسلاید ${fmtNum(i + 1)}`} visible={{ name: `slides.${i}.visible`, value: sl?.visible ?? true }}>
            <div className={styles.slide}>
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className={styles.slidePreview} />
              ) : (
                <div className={styles.slideEmpty}>بدون عکس</div>
              )}
              <div className={styles.partBody}>
                <Text name={`slides.${i}.title`} label="عنوان" value={sl?.title ?? ""} max={80} />
                <Text name={`slides.${i}.text`} label="متن کوتاه" value={sl?.text ?? ""} max={200} />
                <div className={styles.grid2}>
                  <Text name={`slides.${i}.cta`} label="متن دکمه" value={sl?.cta ?? ""} max={30} />
                  <Text name={`slides.${i}.href`} label="آدرس دکمه" value={sl?.href ?? ""} ltr max={500} />
                </div>
                <div className={styles.grid2}>
                  <Text
                    name={`slides.${i}.image`}
                    label="عکس"
                    value={sl?.image ?? ""}
                    ltr
                    max={500}
                    hint="آدرس https://… یا مسیر فایل (مثل demo/slides/slide-1.svg). آپلود مستقیم با فعال‌شدن فضای ذخیره‌سازی اضافه می‌شود."
                  />
                  <label className={ui.field}>
                    <span className={ui.label}>رنگ متن‌باکس</span>
                    <select className={ui.select} name={`slides.${i}.tone`} defaultValue={sl?.tone ?? "green"}>
                      <option value="green">سبز</option>
                      <option value="orange">نارنجی</option>
                      <option value="dark">سبز تیره</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </Part>
        );
      })}
    </>
  );
}

function AboutForm({ d }: { d: BlockMap["page.about"] }) {
  const rows = [...d.sections, ...Array.from({ length: Math.max(0, 6 - d.sections.length) }, () => ({ title: "", text: "" }))];
  return (
    <>
      <Part title="معرفی">
        <Text name="title" label="عنوان صفحه" value={d.title} max={100} />
        <Area name="intro" label="متن معرفی" value={d.intro} rows={4} />
      </Part>
      {rows.map((sec, i) => (
        <Part key={i} title={`بخش ${fmtNum(i + 1)}`} hint={i === rows.length - 1 ? "بخشی که عنوان و متن ندارد نمایش داده نمی‌شود." : undefined}>
          <Text name={`sections.${i}.title`} label="عنوان" value={sec.title} max={100} />
          <Area name={`sections.${i}.text`} label="متن" value={sec.text} rows={3} />
        </Part>
      ))}
    </>
  );
}

function ContactForm({ d }: { d: BlockMap["page.contact"] }) {
  return (
    <>
      <Part title="سربرگ صفحه">
        <Text name="title" label="عنوان" value={d.title} max={100} />
        <Area name="intro" label="متن" value={d.intro} rows={2} max={600} />
      </Part>
      <Part title="اطلاعات تماس" hint="هر مورد خالی بماند، در صفحه نمایش داده نمی‌شود.">
        <Area name="address" label="آدرس" value={d.address} rows={2} max={300} />
        <div className={styles.grid2}>
          <Text name="phone" label="تلفن" value={d.phone} ltr max={40} />
          <Text name="email" label="ایمیل" value={d.email} ltr max={120} />
        </div>
        <Text name="hours" label="ساعت پاسخ‌گویی" value={d.hours} max={120} />
      </Part>
      <Part title="موضوع‌های فرم">
        <Area name="l:subjects" label="هر خط یک موضوع" value={d.subjects.join("\n")} rows={6} max={800} />
      </Part>
    </>
  );
}

export default async function BlockEditPage({ params }: PageProps<"/admin/site/[block]">) {
  await requirePermission("site.manage");
  const { block: slug } = await params;
  const meta = BLOCK_PAGES.find((b) => b.slug === slug);
  if (!meta) notFound();
  const ready = await catalogReady();
  const block = await getBlock(meta.key);
  const d = block.data;

  return (
    <>
      <div className={panel.pageHead}>
        <div>
          <h1 className={panel.pageTitle}>{meta.title}</h1>
          <p className={panel.pageSub}>{meta.desc}</p>
        </div>
        <Link href="/admin/site" className={panel.btnGhost}>
          بازگشت
        </Link>
      </div>
      {!ready ? (
        <div className={panel.impersonation}>جدول‌های سایت هنوز ساخته نشده‌اند. در کنسول لیارا npm run db:migrate را اجرا کنید.</div>
      ) : (
        <div className={panel.card}>
          <ActionForm action={saveBlockAction} submitLabel="ذخیره">
            <input type="hidden" name="__block" value={meta.key} />
            {meta.key !== "header" && (
              <Part title="کل این بخش">
                <Show name="__visible" value={block.isVisible} label="در سایت نمایش داده شود" />
              </Part>
            )}
            {meta.key === "header" && <HeaderForm d={d as BlockMap["header"]} />}
            {meta.key === "footer" && <FooterForm d={d as BlockMap["footer"]} />}
            {meta.key === "home.slider" && <SliderForm d={d as BlockMap["home.slider"]} />}
            {meta.key === "page.about" && <AboutForm d={d as BlockMap["page.about"]} />}
            {meta.key === "page.contact" && <ContactForm d={d as BlockMap["page.contact"]} />}
          </ActionForm>
          {block.updatedAt && (
            <div style={{ marginTop: 16 }}>
              <ActionForm
                action={resetBlockAction}
                submitLabel="برگرداندن به پیش‌فرض"
                submitVariant="danger"
                confirm="همه‌ی تغییرات این بخش پاک شود و مقدار پیش‌فرض برگردد؟ (مقدار فعلی در لاگ فعالیت می‌ماند)"
              >
                <input type="hidden" name="__block" value={meta.key} />
              </ActionForm>
            </div>
          )}
        </div>
      )}
    </>
  );
}
