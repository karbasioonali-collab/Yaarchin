// محتوای ویرایش‌پذیر سایت (جدول site_blocks): تعریف ساختار، مقدار پیش‌فرض و پاک‌سازی ورودی.
// قانون: هر چیزی که از دیتابیس یا فرم پنل می‌آید از normalize رد می‌شود؛ فیلدِ نبود یا خراب ← مقدار پیش‌فرض.
// پس اضافه کردن فیلد جدید فقط یعنی اضافه کردنش به نوع و پیش‌فرض همین فایل؛ migration لازم نیست.

export type SiteLink = { label: string; href: string };

export type HeaderData = {
  topBar: { visible: boolean; text: string; phone: string };
  nav: { visible: boolean; links: SiteLink[] };
  categoriesMenu: { visible: boolean; label: string };
  account: { visible: boolean };
  cta: { visible: boolean; label: string; href: string };
};

export type FooterData = {
  about: { visible: boolean; text: string };
  links: { visible: boolean; title: string; items: SiteLink[] };
  categories: { visible: boolean; title: string; limit: number };
  products: { visible: boolean; title: string; limit: number };
  contact: { visible: boolean; title: string; address: string; phone: string; email: string };
  enamad: { visible: boolean; id: string; code: string };
  social: { visible: boolean; items: SiteLink[] };
  copyright: { visible: boolean; text: string };
};

export type SlideTone = "green" | "orange" | "dark";
export type Slide = {
  visible: boolean;
  title: string;
  text: string;
  image: string;
  href: string;
  cta: string;
  tone: SlideTone;
};
export type SliderData = { intervalSec: number; slides: Slide[] };

export type AboutData = { title: string; intro: string; sections: { title: string; text: string }[] };

export type ContactData = {
  title: string;
  intro: string;
  address: string;
  phone: string;
  email: string;
  hours: string;
  subjects: string[];
};

export type BlockMap = {
  header: HeaderData;
  footer: FooterData;
  "home.slider": SliderData;
  "page.about": AboutData;
  "page.contact": ContactData;
};
export type BlockKey = keyof BlockMap;
export const BLOCK_KEYS: BlockKey[] = ["header", "footer", "home.slider", "page.about", "page.contact"];

export const MAX_SLIDES = 7;
export const MAX_LINKS = 8;

// ---------- پیش‌فرض‌ها (تا وقتی ادمین از پنل ذخیره نکرده) ----------
// شماره و آدرس‌ها نمونه‌اند و باید از پنل (سایت ← …) با مقدار واقعی جایگزین شوند.
export const DEFAULTS: BlockMap = {
  header: {
    topBar: { visible: true, text: "استعلام قیمت از چند کارخانه‌ی چینی، بدون واسطه‌ی اضافه", phone: "021-00000000" },
    nav: {
      visible: true,
      links: [
        { label: "خانه", href: "/" },
        { label: "درباره‌ی ما", href: "/about" },
        { label: "تماس با ما", href: "/contact" },
      ],
    },
    categoriesMenu: { visible: true, label: "دسته‌بندی‌ها" },
    account: { visible: true },
    cta: { visible: true, label: "مشاوره‌ی رایگان", href: "/contact" },
  },
  footer: {
    about: {
      visible: true,
      text: "یارچین قیمت و مشخصات یک محصول را از چند کارخانه‌ی چینی کنار هم می‌گذارد تا با دید روشن‌تر و هزینه‌ی کمتر وارد کنید.",
    },
    links: {
      visible: true,
      title: "دسترسی سریع",
      items: [
        { label: "درباره‌ی ما", href: "/about" },
        { label: "تماس با ما", href: "/contact" },
      ],
    },
    categories: { visible: true, title: "دسته‌بندی‌ها", limit: 6 },
    products: { visible: true, title: "محصولات تازه", limit: 5 },
    contact: { visible: true, title: "ارتباط با ما", address: "تهران", phone: "021-00000000", email: "info@example.com" },
    enamad: { visible: true, id: "", code: "" },
    social: { visible: false, items: [] },
    copyright: { visible: true, text: "همه‌ی حقوق برای یارچین محفوظ است." },
  },
  "home.slider": {
    intervalSec: 6,
    slides: [
      {
        visible: true,
        title: "واردات از چین، شفاف و بی‌دردسر",
        text: "قیمت یک محصول را از چند کارخانه ببینید و مطمئن انتخاب کنید.",
        image: "demo/slides/slide-1.svg",
        href: "/c/home-kitchen",
        cta: "دیدن محصولات",
        tone: "green",
      },
      {
        visible: true,
        title: "لوازم برقی آشپزخانه",
        text: "مخلوط‌کن، آبمیوه‌گیری و بیشتر؛ با بازه‌ی قیمت واقعی کارخانه‌ها.",
        image: "demo/slides/slide-2.svg",
        href: "/c/kitchen-appliances",
        cta: "مشاهده",
        tone: "orange",
      },
      {
        visible: true,
        title: "لوازم جانبی موبایل",
        text: "پاوربانک و هندزفری از تأمین‌کننده‌های بررسی‌شده.",
        image: "demo/slides/slide-3.svg",
        href: "/c/phone-accessories",
        cta: "مشاهده",
        tone: "dark",
      },
      {
        visible: true,
        title: "روشنایی LED",
        text: "لامپ و ریسه‌ی هوشمند برای فروشگاه و پروژه.",
        image: "demo/slides/slide-4.svg",
        href: "/c/led-lighting",
        cta: "مشاهده",
        tone: "green",
      },
      {
        visible: true,
        title: "بسته‌بندی برای برند شما",
        text: "کیسه و جعبه‌ی کرافت با چاپ اختصاصی و حداقل سفارش پایین.",
        image: "demo/slides/slide-5.svg",
        href: "/c/packaging",
        cta: "مشاهده",
        tone: "orange",
      },
      {
        visible: true,
        title: "از استعلام تا تحویل در ایران",
        text: "کارشناس‌های یارچین در همه‌ی مراحل کنار شما هستند.",
        image: "demo/slides/slide-6.svg",
        href: "/contact",
        cta: "گفتگو با کارشناس",
        tone: "dark",
      },
    ],
  },
  "page.about": {
    title: "درباره‌ی یارچین",
    intro:
      "یارچین پلی است میان خریدار ایرانی و کارخانه‌های چین. ما برای هر محصول، اطلاعات چند کارخانه را جمع می‌کنیم و یک تصویر روشن از قیمت، حداقل سفارش و مشخصات به شما می‌دهیم.",
    sections: [
      {
        title: "چرا چند کارخانه؟",
        text: "قیمت یک کارخانه به‌تنهایی معیار خوبی نیست. وقتی بازه و میانگین قیمت چند تأمین‌کننده را کنار هم ببینید، راحت‌تر تصمیم می‌گیرید و مذاکره‌ی بهتری دارید.",
      },
      {
        title: "هزینه‌ی تمام‌شده تا ایران",
        text: "قیمت کارخانه فقط بخشی از هزینه است. یارچین حمل، بیمه، حقوق گمرکی و نرخ ارز را هم در نظر می‌گیرد تا عدد واقعی را بدانید.",
      },
      {
        title: "همراهی کارشناس",
        text: "از اولین سؤال تا رسیدن کالا، کارشناس‌های ما پاسخ‌گوی شما هستند.",
      },
    ],
  },
  "page.contact": {
    title: "تماس با ما",
    intro: "سؤال، پیشنهاد یا درخواست همکاری دارید؟ پیام بگذارید؛ در اولین فرصت پاسخ می‌دهیم.",
    address: "تهران",
    phone: "021-00000000",
    email: "info@example.com",
    hours: "شنبه تا چهارشنبه، ۹ تا ۱۷",
    subjects: ["استعلام قیمت محصول", "پیگیری سفارش", "همکاری و تأمین", "پیشنهاد و انتقاد", "سایر"],
  },
};

// ---------- پاک‌سازی ----------
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function str(v: unknown, def: string, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : def;
}
export function bool(v: unknown, def: boolean): boolean {
  return typeof v === "boolean" ? v : def;
}
export function int(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
}

// فقط لینک داخلی (/…)، http(s)، tel: و mailto: پذیرفته می‌شود؛ javascript: و مانند آن رد می‌شود.
export function safeHref(v: unknown): string {
  if (typeof v !== "string") return "";
  const h = v.trim();
  if (h.startsWith("/") && !h.startsWith("//")) return h.slice(0, 500);
  if (/^(https?:\/\/|tel:|mailto:)[^\s<>"']+$/i.test(h)) return h.slice(0, 500);
  return "";
}

function links(v: unknown, def: SiteLink[]): SiteLink[] {
  if (!Array.isArray(v)) return def;
  return v
    .filter(isObj)
    .map((l) => ({ label: str(l.label, "", 60), href: safeHref(l.href) }))
    .filter((l) => l.label && l.href)
    .slice(0, MAX_LINKS);
}

function sub<T extends Obj>(v: unknown, def: T, fix: (o: Obj, d: T) => T): T {
  return fix(isObj(v) ? v : {}, def);
}

const TONES: SlideTone[] = ["green", "orange", "dark"];

// کلید فایل storage یا مسیر داخلی/https؛ بقیه رد می‌شود
function imageKey(v: unknown, def: string): string {
  if (typeof v !== "string") return def;
  const s = v.trim();
  if (!s) return "";
  if (/^https:\/\/[^\s<>"']+$/.test(s)) return s.slice(0, 500);
  if (/^\/?[\w\-./]+$/.test(s) && !s.includes("..")) return s.slice(0, 300);
  return def;
}

export const normalize: { [K in BlockKey]: (v: unknown) => BlockMap[K] } = {
  header(v) {
    const d = DEFAULTS.header;
    const o = isObj(v) ? v : {};
    return {
      topBar: sub(o.topBar, d.topBar, (x, dd) => ({
        visible: bool(x.visible, dd.visible),
        text: str(x.text, dd.text, 160),
        phone: str(x.phone, dd.phone, 40),
      })),
      nav: sub(o.nav, d.nav, (x, dd) => ({ visible: bool(x.visible, dd.visible), links: links(x.links, dd.links) })),
      categoriesMenu: sub(o.categoriesMenu, d.categoriesMenu, (x, dd) => ({
        visible: bool(x.visible, dd.visible),
        label: str(x.label, dd.label, 40) || dd.label,
      })),
      account: sub(o.account, d.account, (x, dd) => ({ visible: bool(x.visible, dd.visible) })),
      cta: sub(o.cta, d.cta, (x, dd) => ({
        visible: bool(x.visible, dd.visible),
        label: str(x.label, dd.label, 40),
        href: x.href === undefined ? dd.href : safeHref(x.href),
      })),
    };
  },
  footer(v) {
    const d = DEFAULTS.footer;
    const o = isObj(v) ? v : {};
    return {
      about: sub(o.about, d.about, (x, dd) => ({ visible: bool(x.visible, dd.visible), text: str(x.text, dd.text, 600) })),
      links: sub(o.links, d.links, (x, dd) => ({
        visible: bool(x.visible, dd.visible),
        title: str(x.title, dd.title, 60),
        items: links(x.items, dd.items),
      })),
      categories: sub(o.categories, d.categories, (x, dd) => ({
        visible: bool(x.visible, dd.visible),
        title: str(x.title, dd.title, 60),
        limit: int(x.limit, dd.limit, 1, 12),
      })),
      products: sub(o.products, d.products, (x, dd) => ({
        visible: bool(x.visible, dd.visible),
        title: str(x.title, dd.title, 60),
        limit: int(x.limit, dd.limit, 1, 12),
      })),
      contact: sub(o.contact, d.contact, (x, dd) => ({
        visible: bool(x.visible, dd.visible),
        title: str(x.title, dd.title, 60),
        address: str(x.address, dd.address, 300),
        phone: str(x.phone, dd.phone, 40),
        email: str(x.email, dd.email, 120),
      })),
      // اینماد فقط id و code را می‌گیرد و HTML آن را خود سایت می‌سازد (HTML دلخواه در صفحه تزریق نمی‌شود).
      enamad: sub(o.enamad, d.enamad, (x, dd) => ({
        visible: bool(x.visible, dd.visible),
        id: str(x.id, dd.id, 40).replace(/[^\w-]/g, ""),
        code: str(x.code, dd.code, 80).replace(/[^\w-]/g, ""),
      })),
      social: sub(o.social, d.social, (x, dd) => ({ visible: bool(x.visible, dd.visible), items: links(x.items, dd.items) })),
      copyright: sub(o.copyright, d.copyright, (x, dd) => ({
        visible: bool(x.visible, dd.visible),
        text: str(x.text, dd.text, 200),
      })),
    };
  },
  "home.slider"(v) {
    const d = DEFAULTS["home.slider"];
    const o = isObj(v) ? v : {};
    const slides = Array.isArray(o.slides)
      ? o.slides
          .filter(isObj)
          .map((s) => ({
            visible: bool(s.visible, true),
            title: str(s.title, "", 80),
            text: str(s.text, "", 200),
            image: imageKey(s.image, ""),
            href: s.href === undefined ? "" : safeHref(s.href),
            cta: str(s.cta, "", 30),
            tone: TONES.includes(s.tone as SlideTone) ? (s.tone as SlideTone) : "green",
          }))
          .filter((s) => s.title || s.image)
          .slice(0, MAX_SLIDES)
      : d.slides;
    return { intervalSec: int(o.intervalSec, d.intervalSec, 3, 20), slides };
  },
  "page.about"(v) {
    const d = DEFAULTS["page.about"];
    const o = isObj(v) ? v : {};
    const sections = Array.isArray(o.sections)
      ? o.sections
          .filter(isObj)
          .map((s) => ({ title: str(s.title, "", 100), text: str(s.text, "", 2000) }))
          .filter((s) => s.title || s.text)
          .slice(0, 8)
      : d.sections;
    return { title: str(o.title, d.title, 100) || d.title, intro: str(o.intro, d.intro, 2000), sections };
  },
  "page.contact"(v) {
    const d = DEFAULTS["page.contact"];
    const o = isObj(v) ? v : {};
    const subjects = Array.isArray(o.subjects)
      ? o.subjects.map((s) => str(s, "", 60)).filter(Boolean).slice(0, 10)
      : d.subjects;
    return {
      title: str(o.title, d.title, 100) || d.title,
      intro: str(o.intro, d.intro, 600),
      address: str(o.address, d.address, 300),
      phone: str(o.phone, d.phone, 40),
      email: str(o.email, d.email, 120),
      hours: str(o.hours, d.hours, 120),
      subjects: subjects.length ? subjects : d.subjects,
    };
  },
};
