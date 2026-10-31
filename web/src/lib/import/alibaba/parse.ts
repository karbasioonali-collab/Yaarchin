// خواننده‌ی صفحه‌ی محصول علی‌بابا. ورودی: HTML (از فایل MHTML با mhtml.ts، یا بعداً HTML زنده‌ای که اکستنشن می‌فرستد).
// خروجی: داده‌ی ساختاریافته + وضعیت هر فیلد (found / estimated / missing) + هشدارها. هیچ دیتابیسی لمس نمی‌شود.
// docs/infoyaarchin.md بخش ۳۵. بدون server-only تا تست واحد مستقیم اجرایش کند.
//
// چرا DOM و نه داده‌ی داخل اسکریپت: کروم موقع ذخیره‌ی MHTML همه‌ی <script>ها را حذف می‌کند. پس فقط بخش‌های نمایش‌داده‌شده
// خوانده می‌شوند، با برچسب‌های نسبتاً پایدار data-testid و data-module-name (نه کلاس‌های CSS که با هر build علی‌بابا عوض می‌شوند).
// تله: صفحه ده‌ها کارت «محصولات پیشنهادی» با قیمت و MOQ دارد. قیمت فقط از اولین module_price بیرون از کارت‌های پیشنهادی و عکس
// فقط از module_productImage.
import { byAttr, byTag, type DomNode, type El, first, insideRecommendation, isEl, parseHtml, text, texts } from "./dom";
import { type Currency, estimateCarton, normUnit, type Packing, parseDims, parsePerCarton, parsePrice, parseQtyRange, parseWeight } from "./values";

// با هر تغییر رفتار خواننده یک واحد بالا برود (در raw_pages ذخیره می‌شود تا صفحه‌های قدیمی دوباره خوانده شوند)
export const PARSER_VERSION = 1;

export type FieldStatus = "found" | "estimated" | "missing";
export type PriceTier = { minQty: number; maxQty: number | null; price: number; priceMax: number | null };
export type LeadTier = { minQty: number; maxQty: number | null; days: number };
export type PageImage = { url: string; originalUrl: string; embedded: boolean; type: string | null; size: number | null };
export type Supplier = {
  name: string | null;
  // trading | manufacturer | other (فقط ثبت می‌شود؛ بیشتر فروشنده‌های علی‌بابا بازرگانی‌اند)
  type: "trading" | "manufacturer" | "other" | null;
  typeRaw: string | null;
  country: string | null;
  years: number | null;
  rating: number | null;
  revenue: string | null;
  responseTime: string | null;
  onTimeRate: string | null;
  topBuyers: number | null;
  avgDispatchDays: number | null;
  storeId: string | null;
  storeUrl: string | null;
  profileUrl: string | null;
  about: string | null;
};
export type AlibabaPage = {
  parserVersion: number;
  productUrl: string | null;
  productId: string | null;
  title: string | null;
  categoryPath: string[];
  currency: Currency | null;
  priceTiers: PriceTier[];
  moq: number | null;
  unit: string | null;
  attributes: { name: string; value: string }[];
  placeOfOrigin: string | null;
  options: { name: string; values: string[]; customizable: boolean }[];
  customization: { name: string; moq: number | null }[];
  leadTimes: LeadTier[];
  packing: Packing;
  images: PageImage[];
  galleryCount: number;
  descriptionImages: PageImage[];
  hasVideo: boolean;
  highlights: string[];
  supplier: Supplier;
  fields: Record<string, FieldStatus>;
  warnings: string[];
};

// منبع داخل فایل (MHTML): نوع و حجم عکس با همان لینکی که صفحه دارد؛ null = فقط لینک است
export type ResourceLookup = (url: string) => { type: string; size: number } | null;

const abs = (u: string) => (u.startsWith("//") ? "https:" + u : u);
// لینک عکس اصلی بدون پسوند اندازه («…/H123.jpg_960x960q80.jpg» ← «…/H123.jpg»)
export const originalImageUrl = (u: string) => abs(u).replace(/(\.(?:jpe?g|png|webp|gif))_[^/]*$/i, "$1");

const RECOMMEND = new Set(["module_recommend", "module_you_may_like", "module_seo_recommendation", "module_related_searches", "module_popular"]);

function cleanUrl(u: string | null): string | null {
  if (!u) return null;
  try {
    const x = new URL(abs(u));
    return `${x.protocol}//${x.host}${x.pathname}`;
  } catch {
    return null;
  }
}

function imagesIn(root: El | null, lookup: ResourceLookup | undefined): PageImage[] {
  if (!root) return [];
  const seen = new Set<string>();
  const out: PageImage[] = [];
  for (const img of byTag(root, "img")) {
    const src = img.attribs.src || img.attribs["data-src"] || "";
    if (!src || src.startsWith("data:") || !/alicdn\.com/.test(src)) continue;
    const url = abs(src);
    if (seen.has(url)) continue;
    seen.add(url);
    const r = lookup?.(url) ?? null;
    out.push({ url, originalUrl: originalImageUrl(url), embedded: !!r, type: r?.type ?? null, size: r?.size ?? null });
  }
  return out;
}

function supplierOf(R: DomNode): Supplier {
  const s: Supplier = {
    name: null,
    type: null,
    typeRaw: null,
    country: null,
    years: null,
    rating: null,
    revenue: null,
    responseTime: null,
    onTimeRate: null,
    topBuyers: null,
    avgDispatchDays: null,
    storeId: null,
    storeUrl: null,
    profileUrl: null,
    about: null,
  };
  const mini = first(R, "data-module-name", "module_3_tab_mini_company_card") ?? first(R, "data-testid", "three-column-mini-company-card");
  const card = first(R, "data-module-name", "module_unifed_company_card");
  if (mini) {
    const nameLink = byTag(mini, "a").find((a) => text(a));
    s.name = nameLink ? text(nameLink) : null;
    for (const t of texts(mini)) {
      if (!s.country && /^[A-Z]{2}$/.test(t)) s.country = t;
      const y = /^(\d+)\s*yrs?$/i.exec(t);
      if (y && s.years === null) s.years = Number(y[1]);
      // نوع فروشنده عبارت کوتاه جداگانه است؛ خود اسم («… Factory Co., Ltd.»، «… Supplier …») حساب نمی‌شود
      if (!s.typeRaw && t !== s.name && t.length < 40 && /^(trading company|(custom )?manufacturer|agent|distributor|wholesaler|buying office|other)\b/i.test(t)) s.typeRaw = t;
    }
    // هر متریک: مقدار و بعد برچسب در گره‌های جدا
    for (const m of byAttr(mini, "data-testid", "three-column-mini-company-card-metric")) {
      const [v, ...rest] = texts(m);
      const label = rest.join(" ").toLowerCase();
      if (/revenue/.test(label)) s.revenue = v;
      else if (/response/.test(label)) s.responseTime = v;
      else if (/on-time/.test(label)) s.onTimeRate = v;
      else if (/rating/.test(label)) s.rating = Number(/^([\d.]+)/.exec(v)?.[1] ?? NaN) || null;
    }
  }
  if (card) {
    const t = texts(card);
    const after = (re: RegExp) => {
      const i = t.findIndex((x) => re.test(x));
      if (i < 0) return null;
      // «ⓘ» بین برچسب و مقدار
      return t.slice(i + 1).find((x) => x !== "ⓘ") ?? null;
    };
    if (!s.name) s.name = t.find((x, i) => i > 0 && t[i - 1] === "Know your supplier") ?? null;
    s.topBuyers = Number(after(/^Top buyers served/)) || null;
    const d = /^(\d+)\s*days?/.exec(after(/^Average dispatch time/) ?? "");
    s.avgDispatchDays = d ? Number(d[1]) : null;
    s.revenue ??= after(/^Online revenue/);
    s.responseTime ??= after(/^Response time/);
    s.onTimeRate ??= after(/^On-time dispatch rate/);
    if (!s.country) s.country = /^Located in ([A-Z]{2})$/.exec(t.find((x) => /^Located in/.test(x)) ?? "")?.[1] ?? null;
  }
  if (s.typeRaw) s.type = /trading/i.test(s.typeRaw) ? "trading" : /manufacturer|factory/i.test(s.typeRaw) ? "manufacturer" : "other";
  // شناسه‌ی فروشگاه = زیردامنه‌ی en.alibaba.com («supplier-a.en.alibaba.com»؛ نسخه‌ی موبایل «….m.en.alibaba.com»)
  const hrefs = byTag(R, "a").map((a) => a.attribs.href ?? "");
  for (const h of hrefs) {
    const m = /^https?:\/\/([a-z0-9-]+)\.(?:m\.)?en\.alibaba\.com(\/[^?#]*)?/i.exec(h);
    if (!m || ["www", "m", "message", "login", "aimode"].includes(m[1].toLowerCase())) continue;
    s.storeId ??= m[1].toLowerCase();
    if (/company_profile/.test(m[2] ?? "")) s.profileUrl ??= `https://${m[1].toLowerCase()}.en.alibaba.com${m[2]}`;
  }
  if (s.storeId) {
    s.storeUrl = `https://${s.storeId}.en.alibaba.com/`;
    s.profileUrl ??= `https://${s.storeId}.en.alibaba.com/company_profile.html`;
  }
  // «About this supplier» و FAQ فروشنده (فقط داخلی؛ اسم فروشنده را دارد و هرگز عمومی نمی‌شود). اسم ماژول در خود علی‌بابا «descption» است.
  const about = first(R, "data-module-name", "module_structure_descption_companyInfo");
  if (about) {
    const t = text(about).replace(/^About this supplier\s*/, "");
    s.about = t ? t.slice(0, 3000) : null;
  }
  return s;
}

export function parseAlibabaProduct(html: string, opts: { url?: string | null; lookup?: ResourceLookup } = {}): AlibabaPage {
  const R = parseHtml(html);
  const warnings: string[] = [];
  const meta = (p: string) => byTag(R, "meta").find((m) => m.attribs.property === p)?.attribs.content ?? null;

  // لینک و شناسه‌ی محصول (لینک فایل؛ og:url نسخه‌ی زبان دیگری مثل indonesian.alibaba.com است)
  const productUrl = cleanUrl(opts.url ?? null) ?? cleanUrl(meta("og:url"));
  const productId = /_(\d{6,})\.html/.exec(productUrl ?? "")?.[1] ?? /-(\d{6,})\.html/.exec(meta("og:url") ?? "")?.[1] ?? null;

  const titleMod = first(R, "data-module-name", "module_title");
  const h1 = (titleMod ? byTag(titleMod, "h1")[0] : null) ?? byTag(R, "h1")[0] ?? null;
  const title = (h1 ? text(h1) : (meta("og:title") ?? "").replace(/\s*-\s*Buy\s.*on Alibaba\.com\s*$/i, "")).trim() || null;

  const bc = first(R, "data-module-name", "module_breadcrumbNew") ?? first(R, "data-module-name", "module_breadcrumb");
  const categoryPath = bc ? byTag(bc, "li").map(text).filter(Boolean) : [];

  // قیمت: فقط اولین module_price (بقیه تکرار نوار چسبان یا کارت‌های پیشنهادی‌اند)
  const priceMod = byAttr(R, "data-module-name", "module_price").find((m) => !insideRecommendation(m, RECOMMEND)) ?? null;
  const priceTiers: PriceTier[] = [];
  let currency: Currency | null = null;
  let unit: string | null = null;
  let moq: number | null = null;
  let unknownCurrency: string | null = null;
  const addPrice = (priceText: string, qtyText: string) => {
    const p = parsePrice(priceText);
    const q = parseQtyRange(qtyText);
    if (!p || !q) return;
    if (!p.currency) unknownCurrency = p.symbol || priceText;
    else currency ??= p.currency;
    if (q.unit) unit ??= q.unit;
    priceTiers.push({ minQty: q.min, maxQty: q.max, price: p.min, priceMax: p.max });
  };
  if (priceMod) {
    for (const tier of byAttr(priceMod, "data-testid", "pc-purchase-price-tier")) {
      const cur = first(tier, "data-testid", "pc-purchase-price-tier-current");
      const rng = tier.children
        .filter((c): c is El => isEl(c) && !c.attribs["data-testid"])
        .map(text)
        .join(" ");
      if (cur) addPrice(text(cur), rng);
    }
    if (!priceTiers.length) {
      const cur = first(priceMod, "data-testid", "pc-purchase-current-price");
      const eff = first(priceMod, "data-testid", "pc-purchase-effective-moq");
      if (cur && eff) addPrice(text(cur), text(eff));
    }
  }
  if (unknownCurrency) {
    warnings.push(`ارز قیمت شناخته نشد («${unknownCurrency}»)؛ فقط دلار و یوان پذیرفته می‌شود. حساب علی‌بابا را روی USD بگذارید.`);
    priceTiers.length = 0;
  }
  priceTiers.sort((a, b) => a.minQty - b.minQty);
  moq = priceTiers[0]?.minQty ?? null;
  const u = unit ? normUnit(unit) : null;
  if (u && !u.known) warnings.push(`واحد «${unit}» در فهرست واحدهای سایت نیست؛ در صفحه‌ی بررسی واحد را انتخاب کنید.`);

  // مشخصات (جدول Key attributes و بخش Packaging and delivery)
  const attributes: { name: string; value: string }[] = [];
  const seenAttr = new Set<string>();
  for (const row of byAttr(R, "data-testid", "module-attribute-row")) {
    if (insideRecommendation(row, RECOMMEND)) continue;
    const name = text(first(row, "data-testid", "module-attribute-name"));
    const value = text(first(row, "data-testid", "module-attribute-value"));
    const k = name + "\u0000" + value;
    if (!name || seenAttr.has(k)) continue;
    seenAttr.add(k);
    attributes.push({ name, value });
  }
  const attr = (re: RegExp) => attributes.find((a) => re.test(a.name.trim()))?.value ?? null;

  // رنگ‌ها و مدل‌ها (گزینه‌های انتخاب در module_price)
  const options: AlibabaPage["options"] = [];
  if (priceMod)
    for (const a of byAttr(priceMod, "data-testid", "pc-purchase-sku-option-attribute")) {
      const name = texts(a)[0] ?? "";
      const raw = byAttr(a, "data-testid", "pc-purchase-sku-option").map((o) => (o.attribs["aria-label"] ?? text(o)).replace(/\s+/g, " ").trim());
      // «White customizable» ← مقدار «White» و علامت سفارشی‌پذیر
      const customizable = raw.some((v) => /\bcustomizable$/i.test(v));
      const values = raw.map((v) => v.replace(/\s*\bcustomizable$/i, "").trim()).filter(Boolean);
      if (name && !options.some((o) => o.name === name)) options.push({ name, values: [...new Set(values)], customizable });
    }

  // سفارشی‌سازی: «Color (Min. order: 20,000 pieces)»
  const customization: { name: string; moq: number | null }[] = [];
  const cust = byAttr(R, "data-section", "module_other_customization")[0];
  if (cust)
    for (const sp of byTag(cust, "span")) {
      const parts = sp.children.filter(isEl).map(text);
      if (parts.length < 1 || !parts[0] || (sp.parent && isEl(sp.parent) && sp.parent.name === "span")) continue;
      const m = /Min\.?\s*order:\s*([\d,]+)/i.exec(parts.slice(1).join(" "));
      if (!customization.some((c) => c.name === parts[0])) customization.push({ name: parts[0], moq: m ? Number(m[1].replace(/,/g, "")) : null });
    }

  // زمان آماده‌سازی: جدول «Quantity (…) | … » و «Lead time (days) | …»؛ «To be negotiated» ثبت نمی‌شود
  const leadTimes: LeadTier[] = [];
  for (const table of byTag(R, "table")) {
    const rows = byTag(table, "tr").map((tr) => tr.children.filter((c): c is El => isEl(c) && (c.name === "td" || c.name === "th")).map(text));
    const q = rows.find((r) => /^quantity/i.test(r[0] ?? ""));
    const d = rows.find((r) => /^lead time/i.test(r[0] ?? ""));
    if (!q || !d) continue;
    for (let i = 1; i < q.length; i++) {
      const range = parseQtyRange(q[i]);
      const days = Number(d[i]);
      if (range && Number.isInteger(days) && days > 0) leadTimes.push({ minQty: range.min, maxQty: range.max, days });
    }
    break;
  }

  // بسته‌بندی: از همه‌ی ردیف‌های مشخصات
  let unitWeightKg: number | null = null;
  let unitDimsCm: Packing["unitDimsCm"] = null;
  let cartonDimsCm: Packing["cartonDimsCm"] = null;
  let cartonWeightKg: number | null = null;
  let unitsPerCarton: number | null = null;
  for (const { name, value } of attributes) {
    const n = name.toLowerCase();
    const carton = /carton|ctn|outer (box|package)|export (box|package)|master/.test(n);
    if (/size|dimension/.test(n) && /(package|packing|carton|ctn|box)/.test(n)) {
      const dims = parseDims(value);
      if (dims) {
        if (carton) cartonDimsCm ??= dims;
        else unitDimsCm ??= dims;
      }
    }
    if (/weight/.test(n)) {
      const w = parseWeight(value);
      if (w) {
        if (carton) cartonWeightKg ??= w;
        else if (/single|unit|gross|net|^weight|product weight/.test(n)) unitWeightKg ??= w;
      }
    }
    unitsPerCarton ??= parsePerCarton(`${value}`) ?? (carton && /(qty|quantity|pcs|pieces|units)/.test(n) ? Number(value.replace(/[^\d]/g, "")) || null : null);
  }
  const packing = estimateCarton({ unitWeightKg, unitDimsCm, unitsPerCarton, cartonDimsCm, cartonWeightKg });
  const qtyAttr = attr(/^quantity$/i);
  if (qtyAttr && !unitsPerCarton) warnings.push(`مشخصات «Quantity: ${qtyAttr}» دارد؛ معلوم نیست تعداد در بسته است یا در کارتن. در صفحه‌ی بررسی روشن کنید.`);

  // عکس‌ها: گالری اصلی و عکس‌های توضیحات (عکس داخل فایل هست یا فقط لینک)
  const gallery = first(R, "data-module-name", "module_productImage");
  const images = imagesIn(gallery ? ({ ...gallery, children: byAttr(gallery, "data-testid", "media-image") } as El) : null, opts.lookup);
  const galleryCount = gallery ? byAttr(gallery, "data-testid", "main-image-thumbnail").length : 0;
  // توضیح محصول (بدون بخش «About this supplier» که عکس‌های کارخانه دارد)
  const descMod = first(R, "data-module-name", "module_structure_descption_productDescription") ?? first(R, "data-module-name", "module_structure_description");
  const descriptionImages = imagesIn(descMod, opts.lookup).filter((i) => !/(icon|logo|flags)/i.test(i.url));
  const hasVideo = !!gallery && (byTag(gallery, "video").length > 0 || /\d\d:\d\d/.test(text(gallery)));
  if (opts.lookup) {
    const miss = descriptionImages.filter((i) => !i.embedded).length;
    if (miss) warnings.push(`${miss} عکس توضیحات داخل فایل نیست (فقط لینک)؛ دفعه‌ی بعد قبل از ذخیره صفحه را آرام تا پایین اسکرول کنید.`);
  }

  const highlights = (descMod ? byAttr(descMod, "data-testid", "product-detail-text-sort") : []).map(text).filter(Boolean);
  const supplier = supplierOf(R);

  const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "");
  const st = (v: unknown, estimated = false): FieldStatus => (!has(v) ? "missing" : estimated ? "estimated" : "found");
  const fields: Record<string, FieldStatus> = {
    productUrl: st(productUrl),
    title: st(title),
    price: st(priceTiers),
    moq: st(moq),
    attributes: st(attributes),
    options: st(options),
    customization: st(customization),
    leadTime: st(leadTimes),
    unitWeight: st(packing.unitWeightKg),
    unitDims: st(packing.unitDimsCm),
    unitsPerCarton: st(packing.unitsPerCarton),
    cartonWeight: st(packing.cartonWeightKg, packing.estimated.cartonWeightKg),
    cartonDims: st(packing.cartonDimsCm, packing.estimated.cartonDimsCm),
    images: st(images),
    descriptionImages: st(descriptionImages),
    highlights: st(highlights),
    supplierName: st(supplier.name),
    supplierType: st(supplier.type),
    supplierYears: st(supplier.years),
    supplierCountry: st(supplier.country),
    supplierProfileUrl: st(supplier.profileUrl),
  };
  if (!priceMod) warnings.push("بخش قیمت (module_price) پیدا نشد؛ شاید ظاهر صفحه‌ی علی‌بابا عوض شده است.");

  return {
    parserVersion: PARSER_VERSION,
    productUrl,
    productId,
    title,
    categoryPath,
    currency: priceTiers.length ? currency : null,
    priceTiers,
    moq,
    unit: u?.unit ?? null,
    attributes,
    placeOfOrigin: attr(/^place of origin$/i),
    options,
    customization,
    leadTimes,
    packing,
    images,
    galleryCount,
    descriptionImages,
    hasVideo,
    highlights,
    supplier,
    fields,
    warnings,
  };
}
