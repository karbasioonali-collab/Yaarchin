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
  { key: "general", labelFa: "عمومی (بقیه)" },
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

// ---------- آیکون خودکار برای دسته‌ی تازه (بخش ۳۸) ----------
// از روی کلمه‌های اسم فارسی، اسم انگلیسی و مسیر دسته‌ی علی‌بابا؛ اگر هیچ کلمه‌ای جور نشد، آیکون والد، و آخر «general».
// عکس واقعی محصول هرگز عکس دسته نمی‌شود (قاعده‌ی مالک)؛ این تابع فقط از همین آیکون‌های گرافیکی انتخاب می‌کند.
const KEYWORDS: Record<Exclude<CategoryIconKey, "general">, string[]> = {
  toys: ["toy", "toys", "game", "puzzle", "doll", "اسباب", "بازی", "عروسک"],
  apparel: ["apparel", "clothing", "clothes", "garment", "shirt", "dress", "fashion", "پوشاک", "لباس", "پیراهن"],
  "bags-shoes": ["bag", "bags", "luggage", "shoe", "shoes", "footwear", "backpack", "کیف", "کفش", "چمدان", "کوله"],
  cosmetics: ["cosmetic", "cosmetics", "beauty", "makeup", "skin care", "perfume", "آرایش", "آرایشی", "بهداشتی", "عطر", "زیبایی"],
  tools: ["tool", "tools", "drill", "wrench", "ابزار"],
  sports: ["sport", "sports", "fitness", "gym", "camping", "ورزش", "ورزشی", "تناسب"],
  "auto-parts": ["auto", "car", "vehicle", "motorcycle", "automobile", "خودرو", "ماشین سواری", "موتور سیکلت"],
  stationery: ["stationery", "office", "pen", "notebook", "school", "تحریر", "اداری", "خودکار", "دفتر"],
  "pet-supplies": ["pet", "pets", "dog", "cat", "animal", "حیوان", "حیوانات", "سگ", "گربه"],
  baby: ["baby", "infant", "kids", "maternity", "کودک", "نوزاد", "بچه"],
  "home-decor": [
    "home decor",
    "decor",
    "decoration",
    "furniture",
    "garden decor",
    "ashtray",
    "ashtrays",
    "smoking",
    "lighter",
    "lighters",
    "candle",
    "vase",
    "دکور",
    "دکوراسیون",
    "مبلمان",
    "زیرسیگاری",
    "سیگار",
    "فندک",
    "شمع",
    "گلدان",
    "خانه",
  ],
  kitchenware: ["kitchen", "kitchenware", "cookware", "tableware", "dining", "cup", "mug", "آشپزخانه", "ظروف", "قابلمه", "لیوان"],
  electronics: ["electronic", "electronics", "consumer electronics", "earbud", "earphone", "speaker", "الکترونیک", "هندزفری", "اسپیکر"],
  packaging: ["packaging", "package", "printing", "paper bag", "box", "bags & boxes", "label", "بسته‌بندی", "بسته بندی", "کارتن", "چاپ", "کیسه"],
  "home-appliances": ["appliance", "appliances", "blender", "juicer", "vacuum", "لوازم برقی", "برقی", "مخلوط", "آبمیوه"],
  lighting: ["light", "lighting", "lamp", "led", "bulb", "روشنایی", "لامپ", "چراغ", "ال‌ای‌دی"],
  "mobile-accessories": ["phone", "mobile", "charger", "power bank", "cable", "case", "موبایل", "گوشی", "شارژر", "پاوربانک"],
  jewelry: ["jewelry", "jewellery", "accessories", "watch", "ring", "necklace", "زیورآلات", "جواهر", "ساعت", "گردنبند", "اکسسوری"],
  health: ["health", "medical", "care", "massage", "سلامت", "پزشکی", "ماساژ"],
  garden: ["garden", "outdoor", "plant", "lawn", "باغ", "باغبانی", "گیاه", "فضای باز"],
  machinery: ["machine", "machinery", "industrial", "equipment", "ماشین‌آلات", "دستگاه", "صنعتی"],
  hardware: ["hardware", "construction", "building", "fastener", "lock", "یراق", "ساختمانی", "قفل", "پیچ"],
};

const fold = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[‌\s_\-/&,>›]+/g, " ")
    .trim()} `;

// کلمه‌های بیشتر و دقیق‌تر برنده است؛ تکه‌های عمیق‌تر مسیر (آخر) وزن بیشتری دارند
export function pickCategoryIcon(input: { nameFa: string; nameEn?: string | null; path?: string[]; parentImage?: string | null }): CategoryIconKey {
  const texts = [input.nameFa, input.nameEn ?? "", ...(input.path ?? []).slice().reverse()].filter(Boolean);
  let best: { key: CategoryIconKey; score: number } | null = null;
  for (const [key, words] of Object.entries(KEYWORDS) as [CategoryIconKey, string[]][]) {
    let score = 0;
    texts.forEach((t, i) => {
      const f = fold(t);
      // کلمه‌ی کامل، یا جمع انگلیسی («bag» در «paper bags»)
      for (const w of words) if (f.includes(fold(w)) || f.includes(fold(`${w}s`))) score += (i < 2 ? 10 : 5 - Math.min(i, 4)) * fold(w).length;
    });
    if (score > 0 && (!best || score > best.score)) best = { key, score };
  }
  return best?.key ?? iconKeyFromImage(input.parentImage) ?? "general";
}
