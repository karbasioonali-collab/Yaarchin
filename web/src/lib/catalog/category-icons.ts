// آیکون‌های آماده‌ی دسته‌بندی (public/media/icons/categories/*.svg؛ هم‌سبک تصویرهای demo، پالت برند).
// آیکون انتخاب‌شده به‌صورت مسیر داخلی در همان ستون categories.image ذخیره می‌شود (بدون migration):
//   /media/icons/categories/<key>.svg  — mediaUrl() مسیرِ شروع‌شده با «/» را همان‌طور برمی‌گرداند.
// آیکون تازه: فایل SVG با همان نام در پوشه + یک سطر اینجا. docs/infoyaarchin.md بخش ۲۰.
export const CATEGORY_ICON_DIR = "/media/icons/categories/";

export const CATEGORY_ICONS = [
  { key: "toys", labelFa: "اسباب‌بازی" },
  { key: "apparel", labelFa: "پوشاک" },
  { key: "bags-shoes", labelFa: "کیف و کفش" },
  { key: "cosmetics", labelFa: "لوازم آرایشی" },
  { key: "tools", labelFa: "ابزار" },
  { key: "sports", labelFa: "لوازم ورزشی" },
  { key: "auto-parts", labelFa: "لوازم خودرو" },
  { key: "stationery", labelFa: "اداری و تحریر" },
  { key: "pet-supplies", labelFa: "حیوانات خانگی" },
  { key: "baby", labelFa: "لوازم کودک" },
  { key: "home-decor", labelFa: "دکوراسیون" },
  { key: "kitchenware", labelFa: "لوازم آشپزخانه" },
  { key: "electronics", labelFa: "الکترونیک" },
  { key: "packaging", labelFa: "بسته‌بندی" },
  { key: "home-appliances", labelFa: "لوازم برقی خانگی" },
  { key: "lighting", labelFa: "روشنایی و LED" },
  { key: "mobile-accessories", labelFa: "لوازم جانبی موبایل" },
  { key: "jewelry", labelFa: "زیورآلات و اکسسوری" },
  { key: "health", labelFa: "سلامت و پزشکی" },
  { key: "garden", labelFa: "باغ و فضای باز" },
  { key: "machinery", labelFa: "ماشین‌آلات صنعتی" },
  { key: "hardware", labelFa: "یراق‌آلات و ساختمانی" },
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICONS)[number]["key"];

const KEYS = new Set<string>(CATEGORY_ICONS.map((i) => i.key));

export const categoryIconPath = (key: CategoryIconKey) => `${CATEGORY_ICON_DIR}${key}.svg`;

export function isCategoryIcon(key: unknown): key is CategoryIconKey {
  return typeof key === "string" && KEYS.has(key);
}

// اگر مقدار ستون image یکی از آیکون‌های آماده است، کلیدش؛ وگرنه null (عکس با آدرس یا کلید storage)
export function iconKeyFromImage(image: string | null | undefined): CategoryIconKey | null {
  if (!image?.startsWith(CATEGORY_ICON_DIR)) return null;
  const key = image.slice(CATEGORY_ICON_DIR.length).replace(/\.svg$/, "");
  return isCategoryIcon(key) ? key : null;
}
