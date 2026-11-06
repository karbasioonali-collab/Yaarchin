// «جواب قیمت با کد» (بخش ۴۶): سؤال قیمتِ بدون تعداد در گفتگوی صفحه‌ی محصول ← جواب از همان داده‌های صفحه‌ی محصول،
// بدون مدل (رایگان و فوری، مثل جواب آماده‌ی احوال‌پرسی). خالص؛ تست واحد مستقیم اجرایش می‌کند.
// تشخیص سخت‌گیر: بعد از حذف اسم همین محصول، هیچ عددی نمانده، همه‌ی کلمه‌ها از فهرست کوتاه مجاز هستند و
// دست‌کم یک کلمه‌ی قیمت (قیمت / چند / چقدر / تومن / دلار) هست. هر چیز دیگر ← مسیر قبلی (ماشین‌حساب یا مدل).
import { fmtDayMonth, fmtNum, fmtUsd, unitFa } from "../format";
import type { PublicLanded } from "../pricing/compute";
import { arrivalText, LEAD_MISSING_NOTE, leadMissing } from "../pricing/arrival-text";
import { round10 } from "../pricing/tiers";
import { normFa } from "./normalize";

// یکسان‌سازی برای مقایسه: normFa (ی/ي، ک/ك، رقم فارسی/عربی ← لاتین، نیم‌فاصله ← فاصله) و فقط حرف و رقم
const words = (s: string) =>
  normFa(s)
    // جداکننده‌ی هزارگان («1,000»، «۱٬۰۰۰») ← یک عدد
    .replace(/(\d)[,٬](?=\d{3}(?!\d))/g, "$1")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
// همه‌ی فاصله‌ها برداشته («مخلوط کن» = «مخلوط‌کن» = «مخلوطکن»)
const squash = (s: string) => words(s).join("");

const PRICE_WORD = /^(قیمت|قیمتش|قیمتشون|قیمتاش|قیمتها|چند|چنده|چنده|چقدر|چقدره|چقد|چقده|تومن|تومنه|تومان|دلار|دلاره)$/;
const ALLOWED = new Set(
  (
    "قیمت قیمتش قیمتشون قیمتاش قیمتها چند چنده چنده چقدر چقدره چقد چقده چیه چیست است هست هستش میشه می شه میشود " +
    "این اینو اینا محصول محصولش محصولتون کالا هر عدد عددی عددش دونه دونه‌ای دونش دانه ای یک یه تک تکی واحد " +
    "تومن تومنه تومان دلار دلاره به حدودا حدود تقریبا الان فعلا لطفا لطفاً سلام ببخشید ممنون مرسی خسته نباشید وقت بخیر درود"
  )
    .split(" ")
    .map((w) => normFa(w).replace(/\s+/g, "")),
);

// کلمه‌هایی که حتی اگر در عنوان محصول باشند، تنها اسم محصول حساب نمی‌شوند (سؤال دیگری می‌سازند: «قیمت حمل چنده؟»)
const NEVER_TITLE = new Set(["حمل", "ارسال", "هزینه", "تحویل", "گمرک", "کرایه", "عمده", "تخفیف", "نمونه", "رنگ", "سفارش", "تعداد", "کارتن", "بسته"]);

// کلمه‌های پیام بعد از حذف اسم همین محصول؛ null = پیام خالی یا خیلی بلند
function withoutTitle(text: string, title: string): string[] | null {
  const w = words(text);
  if (!w.length || w.length > 14) return null;
  const t = squash(title);
  // حذف اسم محصول: هر رشته‌ی پشت‌سرهم از کلمه‌ها که چسبیده‌اش (۳ حرف یا بیشتر) جزئی از عنوان است
  const keep: string[] = [];
  for (let i = 0; i < w.length; ) {
    let j = i;
    let best = -1;
    let acc = "";
    while (j < w.length) {
      acc += w[j];
      if (t.includes(acc)) {
        // دو کلمه یا بیشتر از عنوان، یا یک کلمه‌ی ۴ حرفی یا بلندتر که سؤال دیگری نمی‌سازد
        if (j > i ? acc.length >= 4 : acc.length >= 4 && !NEVER_TITLE.has(w[i])) best = j;
        j++;
      } else break;
    }
    // کلمه‌ی قیمت جزو عنوان حساب نمی‌شود (عنوانی مثل «قیمت‌یاب» نادر است)
    if (best >= 0 && !PRICE_WORD.test(w[i])) i = best + 1;
    else keep.push(w[i++]);
  }
  return keep;
}

// title: عنوان فارسی همین محصول. true = سؤال فقط قیمت است
export function isPriceOnlyQuestion(text: string, title: string): boolean {
  const keep = withoutTitle(text, title);
  if (!keep) return false;
  // عدد بیرون از اسم محصول (تعداد، …) ← مسیر ماشین‌حساب/مدل؛ عدد داخل عنوان («ترازو ۳۰ کیلویی») با عنوان حذف شده
  return keep.some((x) => PRICE_WORD.test(x)) && keep.every((x) => ALLOWED.has(x) && !/\d/.test(x));
}

// ---------- قیمت برای یک تعداد (بخش ۴۷) ----------
// «اگه ۱۰۰۰ تا بگیرم چند میشه؟»، «۵۰۰ تا چند؟»، «قیمت ۲۰۰ عدد»، «۵ هزار تا چقدر درمیاد؟» ← تعداد؛ هر چیز دیگر ← null.
// دقیقاً یک عدد (با «هزار» اختیاری)، بقیه‌ی کلمه‌ها از ALLOWED یا QTY_WORDS، و دست‌کم یک کلمه‌ی قیمت.
// پیام ترکیبی («۵۰۰ تا تا تهران و چند روزه میرسه؟»، «۵۰۰ تا با رنگ قرمز چند؟») ← null (مسیر مدل).
const QTY_WORDS = new Set(
  "تا عدد عددی دونه دانه اگه اگر بگیرم بگیریم بخرم بخریم بخوام بخواهم میخوام بخواییم سفارش بدم بدیم برای واسه درمیاد درمیان تموم شه میشه میشود".split(" ").map((w) => normFa(w)),
);
const QTY_PRICE_WORD = /^(درمیاد|تموم)$/;

export function priceQtyQuestion(text: string, title: string): number | null {
  const keep = withoutTitle(text, title);
  if (!keep) return null;
  const nums = keep.map((x, i) => (/^\d+$/.test(x) ? i : -1)).filter((i) => i >= 0);
  if (nums.length !== 1) return null;
  let qty = Number(keep[nums[0]]);
  const rest = keep.filter((_, i) => i !== nums[0]);
  // «۵ هزار تا»
  if (keep[nums[0] + 1] === "هزار") {
    qty *= 1000;
    rest.splice(rest.indexOf("هزار"), 1);
  }
  if (!Number.isInteger(qty) || qty < 1 || qty > 100_000_000) return null;
  if (!rest.some((x) => PRICE_WORD.test(x) || QTY_PRICE_WORD.test(x))) return null;
  return rest.every((x) => ALLOWED.has(x) || QTY_WORDS.has(x)) ? qty : null;
}

export const QTY_REPLY_END = "برای قیمت قطعی و ثبت سفارش، کارشناس یارچین راهنمایی‌تان می‌کند.";

// همان قالب و گرد کردن کارت ماشین‌حساب صفحه‌ی محصول (هر عدد نزدیک‌ترین ۱۰ تومان، جمع نزدیک‌ترین ۱٬۰۰۰؛ toPublic در compute.ts)
export function buildQtyPriceReply(d: { title: string; unit: string; landed: ({ status: "ready" } & PublicLanded) | { status: "soon" } }, qty: number): string {
  const u = unitFa(d.unit);
  const l = d.landed;
  const lines: string[] = [];
  if (l.status !== "ready" || !l.methods.length) {
    lines.push(`قیمت تمام‌شده تا ایران برای ${fmtNum(qty)} ${u} ${d.title}: استعلام از کارشناس.`);
  } else {
    lines.push(
      l.borderOnly
        ? `قیمت تا مرز ایران برای ${fmtNum(l.qty)} ${u} ${d.title} (قیمت کالا و حمل تا مرز ایران؛ هزینه‌های گمرک، ترخیص و بیمه را کارشناس اعلام می‌کند):`
        : `قیمت تمام‌شده‌ی تخمینی تا ایران برای ${fmtNum(l.qty)} ${u} ${d.title}:`,
    );
    if (l.belowMoq && l.moq !== null) lines.push(`کمتر از حداقل سفارش کارخانه‌ها (${fmtNum(l.moq)} ${u})؛ قیمت با پله‌ی اول حساب شده و ممکن است کارخانه نپذیرد.`);
    for (const m of l.methods) {
      if (m.status === "inquiry" || m.unit === null) {
        lines.push(`- ${m.nameFa}: استعلام از کارشناس`);
        continue;
      }
      // زمان رسیدن با دو بخش آماده‌سازی + حمل (بخش ۵۴)
      lines.push(`- ${m.nameFa}: هر ${u} ${fmtNum(m.unit)} تومان، جمع ${fmtNum(m.total!)} تومان، ${arrivalText(l.leadDays, m.transit)}`);
    }
    if (leadMissing(l.leadDays, l.methods)) lines.push(LEAD_MISSING_NOTE);
    lines.push("این قیمت تخمینی است.");
  }
  lines.push(QTY_REPLY_END);
  return lines.join("\n");
}

export type PriceReplyData = {
  title: string;
  unit: string;
  price: { avg: number; refQty: number; moqFrom: number; tierMin: number | null; tierMax: number | null } | null;
  toman: { avg: number; rateDate: string; isToday: boolean } | null;
  landed: ({ status: "ready" } & PublicLanded) | { status: "soon" };
};

export const PRICE_REPLY_END = "اگر تعداد را بگویید، دقیق‌تر حساب می‌کنم.";

// متن جواب؛ null = محصول قیمت ندارد ← مسیر قبلی
export function buildPriceReply(d: PriceReplyData): string | null {
  const p = d.price;
  if (!p) return null;
  const u = unitFa(d.unit);
  const lines: string[] = [];
  const toman = d.toman ? ` (معادل ${fmtNum(round10(d.toman.avg))} تومان ${d.toman.isToday ? "با نرخ امروز دلار" : `با نرخ ${fmtDayMonth(d.toman.rateDate)}`})` : "";
  lines.push(`قیمت ${d.title} در سایت برای سفارش ${fmtNum(p.refQty)} ${u}: هر ${u} ${fmtUsd(p.avg)} دلار${toman}.`);
  lines.push(
    `حداقل سفارش از ${fmtNum(p.moqFrom)} ${u}${p.tierMin !== null && p.tierMax !== null ? ` | قیمت از ${fmtUsd(p.tierMin)} تا ${fmtUsd(p.tierMax)} دلار، بسته به تعداد` : ""}.`,
  );
  const l = d.landed;
  if (l.status !== "ready" || !l.methods.length) lines.push("قیمت تمام‌شده تا ایران: استعلام از کارشناس.");
  else {
    lines.push(
      l.borderOnly
        ? `قیمت تا مرز ایران برای ${fmtNum(l.qty)} ${u} (قیمت کالا و حمل تا مرز ایران؛ هزینه‌های گمرک، ترخیص و بیمه را کارشناس اعلام می‌کند):`
        : `قیمت تمام‌شده‌ی تخمینی تا ایران برای ${fmtNum(l.qty)} ${u}:`,
    );
    for (const m of l.methods) {
      if (m.status === "inquiry" || m.unit === null) lines.push(`- ${m.nameFa}: استعلام از کارشناس`);
      else {
        lines.push(`- ${m.nameFa}: هر ${u} ${fmtNum(m.unit)} تومان${m.transit ? `، ${arrivalText(l.leadDays, m.transit)}` : ""}`);
      }
    }
    if (leadMissing(l.leadDays, l.methods)) lines.push(LEAD_MISSING_NOTE);
  }
  lines.push("این قیمت تخمینی است.");
  lines.push(PRICE_REPLY_END);
  return lines.join("\n");
}

// ---------- «جواب زمان حمل با کد» (بخش ۵۳) ----------
// «چقدر طول می‌کشه برسه؟»، «کی می‌رسه؟»، «چند روزه میرسه دستم؟»، «زمان حمل چقدره؟» در صفحه‌ی محصول ← روزهای هر روش حمل از همان
// داده‌ی صفحه‌ی محصول (قیمت تمام‌شده‌ی حداقل سفارش)، بدون مدل. در آزمون، مدل برای همین سؤال جواب کلی پایگاه دانش داده بود.
// سخت‌گیر مثل قیمت: بعد از حذف اسم محصول، بدون عدد، همه‌ی کلمه‌ها از فهرست مجاز و دست‌کم یک نشانه‌ی قوی زمان. پیام ترکیبی ← مدل.
const TIME_STRONG = /^(طول|میرسه|برسه|رسه|میرسد|برسد|رسیدن|رسیدنش|زمان|زمانش|زمانشون|روزه|تحویل|تحویلش|کی|مدت|مدتش)$/;
const TIME_WORDS = new Set(
  (
    "طول میکشه می کشه کشه میکشد کشد میرسه می رسه رسه برسه میرسد می رسد برسد رسیدن رسیدنش زمان زمانش زمانشون حمل ارسال تحویل تحویلش " +
    "کی چند چنده چقدر چقدره چقد چقده روز روزه روزی مدت مدتش تا به دست دستم دستمون ایران تهران اینجا ما من شما سفارش بعد از وقتی طول کشیدن " +
    "این اینو محصول کالا الان حدودا حدود تقریبا معمولا لطفا لطفاً سلام ببخشید ممنون مرسی است هست هستش میشه می شه چیه"
  )
    .split(" ")
    .map((w) => normFa(w).replace(/\s+/g, "")),
);
export function isTimeOnlyQuestion(text: string, title: string): boolean {
  const keep = withoutTitle(text, title);
  if (!keep || !keep.length) return false;
  return keep.some((x) => TIME_STRONG.test(x)) && keep.every((x) => TIME_WORDS.has(x) && !/\d/.test(x));
}

export const TIME_REPLY_END = "زمان دقیق را هنگام سفارش کارشناس یارچین اعلام می‌کند.";

// null = هیچ روش حملی روز ندارد ← مسیر قبلی (مدل)
export function buildTimeReply(d: { title: string; landed: ({ status: "ready" } & PublicLanded) | { status: "soon" } }): string | null {
  const l = d.landed;
  if (l.status !== "ready") return null;
  // روش با زمان حمل ثبت‌شده (بخش ۵۴: آماده‌سازی ثبت‌نشده دیگر کل زمان را حذف نمی‌کند)
  const rows = l.methods.filter((m) => m.transit && m.status !== "inquiry");
  if (!rows.length) return null;
  const lines = [`زمان تقریبی رسیدن ${d.title} به ایران:`];
  for (const m of rows) lines.push(`- ${m.nameFa}: ${arrivalText(l.leadDays, m.transit)}`);
  if (l.leadDays === null) lines.push(LEAD_MISSING_NOTE);
  lines.push(TIME_REPLY_END);
  return lines.join("\n");
}
