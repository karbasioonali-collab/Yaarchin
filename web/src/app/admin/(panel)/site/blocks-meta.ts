import type { BlockKey } from "@/lib/site/blocks";

// آدرس صفحه‌ی ویرایش هر بلوک در پنل ← کلید بلوک
export const BLOCK_PAGES: { slug: string; key: BlockKey; title: string; desc: string }[] = [
  { slug: "header", key: "header", title: "هدر", desc: "نوار بالا، منو، دکمه‌ها و منوی دسته‌بندی" },
  { slug: "footer", key: "footer", title: "فوتر", desc: "درباره، لینک‌ها، دسته‌ها و محصولات، تماس، نماد اعتماد" },
  { slug: "slider", key: "home.slider", title: "اسلایدر صفحه‌ی اصلی", desc: "۵ تا ۷ اسلاید با عکس، متن و دکمه" },
  { slug: "about", key: "page.about", title: "درباره‌ی ما", desc: "متن معرفی و بخش‌ها" },
  { slug: "contact", key: "page.contact", title: "تماس با ما", desc: "آدرس، تلفن، ایمیل، ساعت کاری و موضوع‌های فرم" },
];
