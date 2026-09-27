// داده‌ی آزمایشی فاز ۴ (ساختگی ولی واقع‌بینانه). همه با source = 'demo' ثبت می‌شوند.
// اسم شرکت‌ها عمداً با «Demo» شروع می‌شوند تا با هیچ کارخانه‌ی واقعی اشتباه نشوند.
// عکس‌ها: web/public/media/demo/ (تصویرسازی SVG موقت؛ با عکس واقعی محصولات جایگزین می‌شوند).

export const categories = [
  { slug: "home-kitchen", nameFa: "خانه و آشپزخانه", nameEn: "Home & Kitchen", descriptionFa: "لوازم برقی، ظروف پخت و لوازم کاربردی خانه", image: "demo/categories/home-kitchen.svg", sort: 1 },
  { slug: "kitchen-appliances", parent: "home-kitchen", nameFa: "لوازم برقی آشپزخانه", nameEn: "Kitchen Appliances", image: "demo/categories/kitchen-appliances.svg", sort: 1 },
  { slug: "blenders", parent: "kitchen-appliances", nameFa: "مخلوط‌کن و آبمیوه‌گیری", nameEn: "Blenders & Juicers", image: "demo/categories/blenders.svg", sort: 1 },
  { slug: "cookware", parent: "home-kitchen", nameFa: "ظروف پخت", nameEn: "Cookware", image: "demo/categories/cookware.svg", sort: 2 },
  { slug: "electronics", nameFa: "الکترونیک و لوازم جانبی", nameEn: "Electronics & Accessories", descriptionFa: "لوازم جانبی موبایل، صوتی و روشنایی هوشمند", image: "demo/categories/electronics.svg", sort: 2 },
  { slug: "phone-accessories", parent: "electronics", nameFa: "لوازم جانبی موبایل", nameEn: "Phone Accessories", image: "demo/categories/phone-accessories.svg", sort: 1 },
  { slug: "power-banks", parent: "phone-accessories", nameFa: "پاوربانک", nameEn: "Power Banks", image: "demo/categories/power-banks.svg", sort: 1 },
  { slug: "earbuds", parent: "phone-accessories", nameFa: "هندزفری و هدفون", nameEn: "Earbuds & Headphones", image: "demo/categories/earbuds.svg", sort: 2 },
  { slug: "led-lighting", parent: "electronics", nameFa: "روشنایی LED", nameEn: "LED Lighting", image: "demo/categories/led-lighting.svg", sort: 2 },
  { slug: "packaging", nameFa: "بسته‌بندی و چاپ", nameEn: "Packaging & Printing", descriptionFa: "کیسه، جعبه و بسته‌بندی با چاپ اختصاصی برند", image: "demo/categories/packaging.svg", sort: 3 },
  { slug: "paper-bags", parent: "packaging", nameFa: "کیسه‌ی کاغذی", nameEn: "Paper Bags", image: "demo/categories/paper-bags.svg", sort: 1 },
];

export const companies = [
  {
    key: "c1",
    nameEn: "Demo Ningbo Homeware Appliance Co., Ltd.",
    type: "manufacturer",
    province: "Zhejiang",
    city: "Ningbo",
    ext: "demo-nb-001",
    cats: ["kitchen-appliances"],
    // تماس و سابقه‌ی مکاتبه‌ی نمونه (migration ۰۰۰۴)
    contacts: [{ name: "Demo Lily Chen", role: "Sales Manager", email: "lily@example.com", wechat: "demo-lily" }],
    correspondence: [
      {
        kind: "chat_summary",
        channel: "alibaba_chat",
        direction: "inbound",
        daysAgo: 5,
        product: "portable-blender",
        body: "خلاصه‌ی نمونه: قیمت ۵۰۰ عدد ۶٫۸ تا ۷٫۲ دلار؛ چاپ لوگو از ۱۰۰۰ عدد رایگان؛ نمونه با هزینه‌ی ارسال خریدار.",
      },
      { kind: "note", channel: "other", direction: "internal", daysAgo: 4, body: "یادداشت نمونه: کیفیت عکس‌های کارخانه خوب است ولی لوگو دارد؛ عکس اختصاصی بخواهیم." },
    ],
  },
  { key: "c2", nameEn: "Demo Zhongshan Kitchen Electric Co., Ltd.", type: "manufacturer", province: "Guangdong", city: "Zhongshan", ext: "demo-zs-002", cats: ["kitchen-appliances"] },
  { key: "c3", nameEn: "Demo Yiwu Smart Living Trading Co., Ltd.", type: "trading", province: "Zhejiang", city: "Yiwu", ext: "demo-yw-003", cats: ["kitchen-appliances", "cookware"] },
  { key: "c4", nameEn: "Demo Yongkang Cookware Industry Co., Ltd.", type: "manufacturer", province: "Zhejiang", city: "Yongkang", ext: "demo-yk-004", cats: ["cookware"] },
  { key: "c5", nameEn: "Demo Hebei Cast Iron Products Co., Ltd.", type: "manufacturer", province: "Hebei", city: "Shijiazhuang", ext: "demo-hb-005", cats: ["cookware"] },
  { key: "c6", nameEn: "Demo Shenzhen Powercell Technology Co., Ltd.", type: "manufacturer", province: "Guangdong", city: "Shenzhen", ext: "demo-sz-006", cats: ["power-banks"] },
  { key: "c7", nameEn: "Demo Dongguan Mobile Energy Co., Ltd.", type: "manufacturer", province: "Guangdong", city: "Dongguan", ext: "demo-dg-007", cats: ["power-banks", "earbuds"] },
  { key: "c8", nameEn: "Demo Shenzhen Soundwave Electronics Co., Ltd.", type: "manufacturer", province: "Guangdong", city: "Shenzhen", ext: "demo-sz-008", cats: ["earbuds"] },
  { key: "c9", nameEn: "Demo Guangzhou Digital Accessories Trading Co.", type: "trading", province: "Guangdong", city: "Guangzhou", ext: "demo-gz-009", cats: ["power-banks", "earbuds"] },
  { key: "c10", nameEn: "Demo Zhongshan Brightlux Lighting Co., Ltd.", type: "manufacturer", province: "Guangdong", city: "Zhongshan", ext: "demo-zs-010", cats: ["led-lighting"] },
  { key: "c11", nameEn: "Demo Xiamen Ecopack Paper Products Co., Ltd.", type: "manufacturer", province: "Fujian", city: "Xiamen", ext: "demo-xm-011", cats: ["paper-bags"] },
  { key: "c12", nameEn: "Demo Wenzhou Printing & Packaging Co., Ltd.", type: "manufacturer", province: "Zhejiang", city: "Wenzhou", ext: "demo-wz-012", cats: ["paper-bags"] },
];

const img = (slug, n, alt) => ({ kind: "image", key: `demo/products/${slug}-${n}.svg`, alt });
const video = (slug, alt) => ({ kind: "video", key: `demo/products/${slug}.webm`, poster: `demo/products/${slug}-1.svg`, alt });
const spec = (labelFa, valueFa, unit) => ({ labelFa, valueFa, ...(unit ? { unit } : {}) });

// importScore: امتیاز «جذاب برای واردات» (۱، ۲، ۳، ۴، ۴٫۵، ۵ یا null = بدون امتیاز؛ دو محصول عمداً بدون امتیاز)
// prices: [minQty, maxQty|null, priceMin, priceMax|null]؛ old: یک نوبت قیمت قدیمی‌تر (برای نشان دادن اینکه فقط آخرین نوبت حساب می‌شود)
export const products = [
  {
    slug: "portable-blender",
    importScore: 4.5,
    // وزن و کارتن (migration ۰۰۰۴؛ برای ماشین‌حساب قیمت تمام‌شده). smart-led-strip-5m عمداً بسته‌بندی ندارد تا «استعلام» دیده شود.
    packing: { unitWeightKg: 0.5, unitsPerCarton: 24, cartonWeightKg: 13.5, cartonLengthCm: 52, cartonWidthCm: 36, cartonHeightCm: 30 },
    category: "blenders",
    titleFa: "مخلوط‌کن قابل‌حمل شارژی ۳۸۰ میلی‌لیتر",
    titleEn: "Portable Rechargeable Blender 380ml",
    summaryFa: "مخلوط‌کن جیبی با باتری ۲۰۰۰ میلی‌آمپر و شارژ USB-C؛ مناسب اسموتی و شیک.",
    descriptionFa:
      "بدنه‌ی بدون BPA، شش تیغه‌ی استیل و قفل ایمنی که تا بسته‌نشدن درب، موتور را روشن نمی‌کند. با هر بار شارژ حدود ۱۵ بار مخلوط می‌کند. امکان چاپ لوگو و بسته‌بندی اختصاصی از حداقل سفارش.",
    hsCode: "8509.40.00",
    specs: [
      spec("حجم", "۳۸۰", "میلی‌لیتر"),
      spec("باتری", "۲۰۰۰", "میلی‌آمپر ساعت"),
      spec("توان موتور", "۴۰", "وات"),
      spec("تعداد تیغه", "۶ تیغه‌ی استیل"),
      spec("شارژ", "USB-C، حدود ۳ ساعت"),
      spec("جنس بدنه", "Tritan بدون BPA"),
      spec("وزن", "۵۰۰", "گرم"),
    ],
    media: [img("portable-blender", 1, "مخلوط‌کن قابل‌حمل سبز"), video("portable-blender", "ویدیوی مخلوط‌کن"), img("portable-blender", 2, "مخلوط‌کن قابل‌حمل نارنجی"), img("portable-blender", 3, "نمای نزدیک مخلوط‌کن")],
    listings: [
      // leadTiers: زمان آماده‌سازی پله‌ای [minQty, maxQty|null, days] (migration ۰۰۰۴؛ جای lead را در سایت می‌گیرد)
      { company: "c1", moq: 500, lead: 20, leadTiers: [[1, 999, 20], [1000, null, 30]], prices: [[500, 999, 6.8, 7.2], [1000, null, 6.1, null]], old: [[500, null, 7.5, null]] },
      { company: "c2", moq: 1000, lead: 25, prices: [[1000, 4999, 5.9, 6.3]] },
      { company: "c3", moq: 100, lead: 10, prices: [[100, 499, 8.2, 8.9], [500, null, 7.6, null]] },
      { company: "c1", moq: 2000, lead: 30, prices: [[2000, null, 5.6, 5.8]], dup: true },
    ],
  },
  {
    slug: "juicer-300w",
    packing: { unitWeightKg: 2.1, unitsPerCarton: 4, cartonWeightKg: 9.6, cartonLengthCm: 48, cartonWidthCm: 42, cartonHeightCm: 40 },
    importScore: 3,
    category: "blenders",
    titleFa: "آبمیوه‌گیری تک‌کاره ۳۰۰ وات",
    titleEn: "Electric Juicer 300W",
    summaryFa: "آبمیوه‌گیری خانگی با دهانه‌ی ۶۵ میلی‌متری و دو سرعت؛ مناسب مرکبات و میوه‌های سفت.",
    descriptionFa: "مخزن تفاله‌ی جداشدنی، پایه‌ی ضدلغزش و فیلتر استیل قابل شست‌وشو. امکان تغییر رنگ بدنه و چاپ برند.",
    hsCode: "8509.40.00",
    specs: [spec("توان", "۳۰۰", "وات"), spec("دهانه‌ی ورودی", "۶۵", "میلی‌متر"), spec("سرعت", "۲ سرعت + پالس"), spec("حجم پارچ", "۵۰۰", "میلی‌لیتر"), spec("ولتاژ", "۲۲۰ تا ۲۴۰ ولت، ۵۰ هرتز")],
    media: [img("juicer-300w", 1, "آبمیوه‌گیری سفید"), img("juicer-300w", 2, "آبمیوه‌گیری سبز"), img("juicer-300w", 3, "نمای نزدیک آبمیوه‌گیری")],
    listings: [
      { company: "c1", moq: 500, lead: 25, prices: [[500, null, 11.5, 12.8]] },
      { company: "c2", moq: 1000, lead: 30, prices: [[1000, null, 10.2, 10.9]] },
      // قیمت یوانی (migration ۰۰۰۵): با نرخ روز یوان به دلار تبدیل و وارد میانگین می‌شود
      { company: "c3", moq: 200, lead: 15, currency: "CNY", prices: [[200, null, 99, 104]] },
    ],
  },
  {
    slug: "cast-iron-pan-28",
    packing: { unitWeightKg: 2.8, unitsPerCarton: 6, cartonWeightKg: 18, cartonLengthCm: 52, cartonWidthCm: 32, cartonHeightCm: 30 },
    importScore: 4,
    category: "cookware",
    titleFa: "ماهیتابه‌ی چدنی ۲۸ سانتی‌متر",
    titleEn: "Pre-seasoned Cast Iron Skillet 28cm",
    summaryFa: "ماهیتابه‌ی چدنی آماده‌ی مصرف با دسته‌ی بلند؛ سازگار با گاز، فر و اجاق القایی.",
    descriptionFa: "پوشش روغن گیاهی از پیش پخته‌شده، ضخامت یکنواخت برای پخش گرما و دسته‌ی کمکی. بسته‌بندی کارتن تکی با امکان چاپ.",
    hsCode: "7321.11.00",
    specs: [spec("قطر", "۲۸", "سانتی‌متر"), spec("جنس", "چدن"), spec("وزن", "۲٫۶", "کیلوگرم"), spec("سازگاری", "گاز، فر، القایی"), spec("پوشش", "روغن گیاهی پخته‌شده")],
    media: [img("cast-iron-pan-28", 1, "ماهیتابه‌ی چدنی"), img("cast-iron-pan-28", 2, "ماهیتابه‌ی چدنی سبز"), img("cast-iron-pan-28", 3, "نمای نزدیک ماهیتابه")],
    listings: [
      { company: "c5", moq: 300, lead: 35, prices: [[300, 999, 7.4, 7.9], [1000, null, 6.8, null]] },
      { company: "c4", moq: 500, lead: 30, prices: [[500, null, 8.1, 8.6]] },
      { company: "c3", moq: 100, lead: 12, prices: [[100, null, 9.8, 10.5]] },
    ],
  },
  {
    slug: "steel-cookware-set-10",
    packing: { unitWeightKg: 4.2, unitsPerCarton: 2, cartonWeightKg: 9.5, cartonLengthCm: 60, cartonWidthCm: 40, cartonHeightCm: 35 },
    importScore: 2,
    category: "cookware",
    titleFa: "سرویس قابلمه‌ی استیل ۱۰ پارچه",
    titleEn: "Stainless Steel Cookware Set 10 pcs",
    summaryFa: "سرویس قابلمه‌ی استیل ۳۰۴ با کف سه‌لایه و درب شیشه‌ای؛ مناسب اجاق القایی.",
    descriptionFa: "شامل ۴ قابلمه و ۱ تابه با درب‌های شیشه‌ای سکوریت. کف کپسولی سه‌لایه برای پخش یکنواخت حرارت. بسته‌بندی رنگی با امکان طراحی اختصاصی.",
    hsCode: "7323.93.00",
    priceUnit: "set",
    specs: [spec("تعداد", "۱۰ پارچه"), spec("جنس", "استیل ۳۰۴"), spec("کف", "سه‌لایه، سازگار با القایی"), spec("درب", "شیشه‌ی سکوریت"), spec("وزن سرویس", "۶٫۸", "کیلوگرم")],
    media: [img("steel-cookware-set-10", 1, "سرویس قابلمه‌ی استیل"), img("steel-cookware-set-10", 2, "سرویس قابلمه‌ی سبز"), img("steel-cookware-set-10", 3, "نمای نزدیک قابلمه")],
    listings: [
      { company: "c4", moq: 200, lead: 35, prices: [[200, 499, 32.5, 35.0], [500, null, 29.9, null]] },
      { company: "c3", moq: 50, lead: 15, prices: [[50, null, 39.0, 42.0]] },
      { company: "c5", moq: 300, lead: 40, prices: [[300, null, 30.5, 31.8]] },
    ],
  },
  {
    slug: "powerbank-10000-pd",
    packing: { unitWeightKg: 0.22, unitsPerCarton: 50, cartonWeightKg: 12.5, cartonLengthCm: 45, cartonWidthCm: 32, cartonHeightCm: 25 },
    importScore: 5,
    category: "power-banks",
    titleFa: "پاوربانک ۱۰۰۰۰ میلی‌آمپر فست‌شارژ PD 20W",
    titleEn: "Power Bank 10000mAh PD 20W Fast Charging",
    summaryFa: "پاوربانک باریک با خروجی USB-C و USB-A، شارژ سریع PD و QC3.0.",
    descriptionFa: "سلول لیتیوم‌پلیمر گرید A، نمایشگر LED چهارمرحله‌ای و محافظت چندلایه در برابر اتصال کوتاه و دمای بالا. دارای گواهی CE، FCC و RoHS (به گفته‌ی تأمین‌کننده‌ها).",
    hsCode: "8507.60.00",
    specs: [spec("ظرفیت", "۱۰۰۰۰", "میلی‌آمپر ساعت"), spec("خروجی", "USB-C PD 20W، USB-A QC3.0 18W"), spec("ورودی", "USB-C 18W"), spec("نوع سلول", "لیتیوم‌پلیمر"), spec("ابعاد", "۱۴۰ × ۶۸ × ۱۵", "میلی‌متر"), spec("وزن", "۲۱۰", "گرم")],
    media: [img("powerbank-10000-pd", 1, "پاوربانک مشکی"), img("powerbank-10000-pd", 2, "پاوربانک سبز"), img("powerbank-10000-pd", 3, "پاوربانک سفید")],
    listings: [
      { company: "c6", moq: 500, lead: 18, prices: [[500, 1999, 5.4, 5.9], [2000, null, 4.9, null]], old: [[500, null, 6.2, null]] },
      { company: "c7", moq: 1000, lead: 20, prices: [[1000, null, 4.7, 5.1]] },
      { company: "c9", moq: 100, lead: 7, prices: [[100, 499, 6.9, 7.4]] },
      { company: "c8", moq: 300, lead: 15, prices: [[300, null, 5.8, 6.2]] },
    ],
  },
  {
    slug: "magnetic-powerbank-5000",
    packing: { unitWeightKg: 0.13, unitsPerCarton: 100, cartonWeightKg: 14.5, cartonLengthCm: 48, cartonWidthCm: 35, cartonHeightCm: 30 },
    importScore: 4.5,
    category: "power-banks",
    titleFa: "پاوربانک مگنتی بی‌سیم ۵۰۰۰ میلی‌آمپر",
    titleEn: "Magnetic Wireless Power Bank 5000mAh",
    summaryFa: "پاوربانک مغناطیسی با شارژ بی‌سیم ۱۵ وات؛ پشت گوشی می‌چسبد.",
    descriptionFa: "حلقه‌ی مغناطیسی قوی، شارژ بی‌سیم ۱۵ وات و خروجی USB-C برای شارژ با سیم. بدنه‌ی سیلیکونی نرم در چند رنگ.",
    hsCode: "8507.60.00",
    specs: [spec("ظرفیت", "۵۰۰۰", "میلی‌آمپر ساعت"), spec("شارژ بی‌سیم", "۱۵", "وات"), spec("خروجی سیمی", "USB-C 20W"), spec("وزن", "۱۱۵", "گرم")],
    media: [img("magnetic-powerbank-5000", 1, "پاوربانک مگنتی سبز"), img("magnetic-powerbank-5000", 2, "پاوربانک مگنتی نارنجی"), img("magnetic-powerbank-5000", 3, "نمای نزدیک پاوربانک مگنتی")],
    listings: [
      { company: "c6", moq: 500, lead: 20, prices: [[500, null, 7.9, 8.6]] },
      { company: "c7", moq: 1000, lead: 25, prices: [[1000, null, 7.2, 7.6]] },
      { company: "c9", moq: 50, lead: 7, prices: [[50, null, 9.8, 10.9]] },
    ],
  },
  {
    slug: "tws-earbuds-bt53",
    packing: { unitWeightKg: 0.08, unitsPerCarton: 100, cartonWeightKg: 9, cartonLengthCm: 50, cartonWidthCm: 35, cartonHeightCm: 30 },
    importScore: 4,
    category: "earbuds",
    titleFa: "هندزفری بی‌سیم TWS بلوتوث ۵٫۳",
    titleEn: "TWS Wireless Earbuds Bluetooth 5.3",
    summaryFa: "هندزفری بی‌سیم با حذف نویز محیطی تماس (ENC)، کیس شارژ ۳۰۰ میلی‌آمپر و کنترل لمسی.",
    descriptionFa: "تأخیر کم برای بازی، مقاوم در برابر عرق (IPX4) و حدود ۵ ساعت پخش با هر شارژ. امکان چاپ لوگو روی کیس و جعبه.",
    hsCode: "8518.30.00",
    priceUnit: "pair",
    specs: [spec("بلوتوث", "۵٫۳"), spec("مدت پخش", "۵ ساعت (۲۰ ساعت با کیس)"), spec("کیس شارژ", "۳۰۰", "میلی‌آمپر ساعت"), spec("مقاومت", "IPX4"), spec("شارژ", "USB-C")],
    media: [img("tws-earbuds-bt53", 1, "هندزفری سفید"), video("tws-earbuds-bt53", "ویدیوی هندزفری"), img("tws-earbuds-bt53", 2, "هندزفری مشکی"), img("tws-earbuds-bt53", 3, "هندزفری سبز")],
    listings: [
      { company: "c8", moq: 500, lead: 15, prices: [[500, 2999, 4.3, 4.8], [3000, null, 3.9, null]] },
      { company: "c7", moq: 1000, lead: 20, prices: [[1000, null, 3.8, 4.1]] },
      { company: "c9", moq: 100, lead: 5, prices: [[100, null, 5.9, 6.5]] },
    ],
  },
  {
    slug: "led-bulb-12w",
    packing: { unitWeightKg: 0.06, unitsPerCarton: 100, cartonWeightKg: 7, cartonLengthCm: 55, cartonWidthCm: 40, cartonHeightCm: 25 },
    importScore: 1,
    category: "led-lighting",
    titleFa: "لامپ LED حبابی ۱۲ وات E27",
    titleEn: "LED Bulb 12W E27",
    summaryFa: "لامپ LED کم‌مصرف با بدنه‌ی آلومینیوم و پلاستیک، نور مهتابی و آفتابی.",
    descriptionFa: "بهره‌ی نوری ۹۰ لومن بر وات، شاخص نمود رنگ بالای ۸۰ و عمر ۲۵۰۰۰ ساعت. بسته‌بندی تکی یا چندتایی با برند شما.",
    hsCode: "8539.52.00",
    specs: [spec("توان", "۱۲", "وات"), spec("سرپیچ", "E27"), spec("شار نوری", "۱۰۸۰", "لومن"), spec("دمای رنگ", "۳۰۰۰K / ۶۵۰۰K"), spec("عمر", "۲۵۰۰۰", "ساعت")],
    media: [img("led-bulb-12w", 1, "لامپ LED"), img("led-bulb-12w", 2, "لامپ LED با سرپیچ نارنجی"), img("led-bulb-12w", 3, "نمای نزدیک لامپ")],
    listings: [
      { company: "c10", moq: 3000, lead: 25, prices: [[3000, 9999, 0.42, 0.48], [10000, null, 0.37, null]] },
      { company: "c3", moq: 500, lead: 12, prices: [[500, null, 0.62, 0.7]] },
      { company: "c10", moq: 10000, lead: 30, prices: [[10000, null, 0.35, 0.39]], dup: true },
    ],
  },
  {
    slug: "smart-led-strip-5m",
    importScore: null,
    category: "led-lighting",
    titleFa: "ریسه‌ی LED هوشمند RGB پنج متری",
    titleEn: "Smart RGB LED Strip 5m",
    summaryFa: "ریسه‌ی LED با کنترل اپلیکیشن و ریموت، هماهنگ با موسیقی؛ چسب پشت‌دار.",
    descriptionFa: "۱۵۰ LED در ۵ متر، قابل برش هر ۳ نود، اتصال وای‌فای و بلوتوث. آداپتور و ریموت در بسته.",
    hsCode: "9405.42.00",
    specs: [spec("طول", "۵", "متر"), spec("تعداد LED", "۱۵۰"), spec("کنترل", "اپلیکیشن، ریموت، صوتی"), spec("ولتاژ", "۱۲ ولت"), spec("محافظت", "IP20")],
    media: [img("smart-led-strip-5m", 1, "ریسه‌ی LED"), img("smart-led-strip-5m", 2, "ریسه‌ی LED مشکی"), img("smart-led-strip-5m", 3, "نمای نزدیک ریسه")],
    listings: [
      { company: "c10", moq: 500, lead: 20, prices: [[500, null, 3.6, 4.1]] },
      { company: "c9", moq: 100, lead: 7, prices: [[100, null, 4.9, 5.4]] },
      { company: "c3", moq: 200, lead: 12, prices: [[200, null, 4.4, 4.7]] },
    ],
  },
  {
    slug: "kraft-paper-bag",
    packing: { unitWeightKg: 0.05, unitsPerCarton: 500, cartonWeightKg: 26, cartonLengthCm: 60, cartonWidthCm: 40, cartonHeightCm: 35 },
    importScore: null,
    category: "paper-bags",
    titleFa: "کیسه‌ی کاغذی کرافت دسته‌دار با چاپ اختصاصی",
    titleEn: "Custom Printed Kraft Paper Bag with Handle",
    summaryFa: "کیسه‌ی کرافت ۱۲۰ گرمی با دسته‌ی تابیده؛ چاپ یک تا چهار رنگ لوگو.",
    descriptionFa: "مناسب فروشگاه، کافه و بسته‌بندی هدیه. ابعاد و رنگ کاغذ (قهوه‌ای یا سفید) قابل انتخاب است. قیمت برای ابعاد ۲۵ × ۳۲ × ۱۲ سانتی‌متر با چاپ یک رنگ.",
    hsCode: "4819.40.00",
    specs: [spec("جنس", "کاغذ کرافت ۱۲۰ گرم"), spec("ابعاد نمونه", "۲۵ × ۳۲ × ۱۲", "سانتی‌متر"), spec("دسته", "کاغذ تابیده"), spec("چاپ", "۱ تا ۴ رنگ")],
    media: [img("kraft-paper-bag", 1, "کیسه‌ی کرافت"), img("kraft-paper-bag", 2, "کیسه‌ی کرافت با چاپ نارنجی"), img("kraft-paper-bag", 3, "نمای نزدیک کیسه")],
    listings: [
      { company: "c11", moq: 5000, lead: 20, prices: [[5000, 19999, 0.16, 0.19], [20000, null, 0.13, null]] },
      { company: "c12", moq: 3000, lead: 18, prices: [[3000, null, 0.18, 0.22]] },
    ],
  },
];

// ---------- نرخ‌ها و هزینه‌های آزمایشی (migration ۰۰۰۵) ----------
// عددها ساختگی‌اند و فقط برای دیدن کارت «قیمت تمام‌شده» روی سایت. قاعده: داده‌ی demo هرگز جای داده‌ی واقعی را نمی‌گیرد؛
// هر بخش فقط وقتی ساخته می‌شود که برای همان ارز/روش/کد هنوز هیچ داده‌ی واقعی (source ≠ demo) نباشد (scripts/seed-demo.mjs).
export const rates = {
  // تومان؛ نرخ گمرکی فقط برای دلار (تا در ماشین‌حساب آزمایشی دیده شود که یوان با نرخ بازار حساب می‌شود)
  exchange: [
    { currency: "USD", kind: "market", toman: 100000 },
    { currency: "CNY", kind: "market", toman: 14000 },
    { currency: "USD", kind: "customs", toman: 70000 },
  ],
  shipping: [
    { method: "air", perKg: 6.5, perCbm: null, factor: 167, min: 150, currency: "USD", days: [7, 12] },
    { method: "sea", perKg: null, perCbm: 180, factor: 1000, min: 250, currency: "USD", days: [40, 55] },
    { method: "land", perKg: 1.4, perCbm: null, factor: 333, min: 120, currency: "USD", days: [20, 30] },
    { method: "rail", perKg: 1.1, perCbm: null, factor: 333, min: 120, currency: "USD", days: [25, 35] },
  ],
  costs: [
    { nameFa: "بیمه (نمونه)", calcType: "percent", amount: 0.5, percentBase: ["goods", "shipping"], currency: null, methods: null },
    { nameFa: "ترخیص و کارمزد گمرک (نمونه)", calcType: "fixed", amount: 3500000, percentBase: null, currency: "IRT", methods: null },
    { nameFa: "حمل داخلی تا انبار (نمونه)", calcType: "formula", formula: "max(۵۰۰۰۰۰، وزن × ۸۰۰۰)", percentBase: null, currency: "IRT", methods: null },
    { nameFa: "انبارداری بندر (نمونه)", calcType: "per_cbm", amount: 12, percentBase: null, currency: "USD", methods: ["sea"] },
  ],
  // حقوق ورودی کدهای محصولات demo (درصد از ارزش CIF = کالا + حمل + بیمه و هزینه‌ها)
  hs: [
    { code: "85094000", titleFa: "مخلوط‌کن و آبمیوه‌گیری خانگی (نمونه)", type: "percent", value: 26 },
    { code: "73211100", titleFa: "وسایل پخت چدنی (نمونه)", type: "percent", value: 32 },
    { code: "73239300", titleFa: "ظروف آشپزخانه‌ی استیل (نمونه)", type: "percent", value: 32 },
    { code: "85076000", titleFa: "باتری لیتیوم-یون و پاوربانک (نمونه)", type: "percent", value: 15 },
    { code: "85183000", titleFa: "هدفون و هندزفری (نمونه)", type: "percent", value: 20 },
    { code: "85395200", titleFa: "لامپ LED (نمونه)", type: "fixed", value: 0.05, currency: "USD", per: "unit" },
    { code: "94054200", titleFa: "چراغ و نوار LED (نمونه)", type: "percent", value: 26 },
    // 48194000 (کیسه‌ی کاغذی) عمداً در لیست نیست تا «HS code در لیست نیست» دیده شود
  ],
};
