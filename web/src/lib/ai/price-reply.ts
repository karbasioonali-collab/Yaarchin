// «جواب قیمت با کد» (بخش ۴۶): سؤال قیمتِ بدون تعداد در گفتگوی صفحه‌ی محصول ← جواب از همان داده‌های صفحه‌ی محصول،
// بدون مدل (رایگان و فوری، مثل جواب آماده‌ی احوال‌پرسی). خالص؛ تست واحد مستقیم اجرایش می‌کند.
// تشخیص سخت‌گیر: بعد از حذف اسم همین محصول، هیچ عددی نمانده، همه‌ی کلمه‌ها از فهرست کوتاه مجاز هستند و
// دست‌کم یک کلمه‌ی قیمت (قیمت / چند / چقدر / تومن / دلار) هست. هر چیز دیگر ← مسیر قبلی (ماشین‌حساب یا مدل).
import { fmtDayMonth, fmtNum, fmtUsd, unitFa } from "../format";
import type { PublicLanded } from "../pricing/compute";
import { round10 } from "../pricing/tiers";
import { normFa } from "./normalize";

// یکسان‌سازی برای مقایسه: normFa (ی/ي، ک/ك، رقم فارسی/عربی ← لاتین، نیم‌فاصله ← فاصله) و فقط حرف و رقم
const words = (s: string) =>
  normFa(s)
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

// title: عنوان فارسی همین محصول. true = سؤال فقط قیمت است
export function isPriceOnlyQuestion(text: string, title: string): boolean {
  const w = words(text);
  if (!w.length || w.length > 14) return false;
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
  // عدد بیرون از اسم محصول (تعداد، …) ← مسیر ماشین‌حساب/مدل؛ عدد داخل عنوان («ترازو ۳۰ کیلویی») با عنوان حذف شده
  return keep.some((x) => PRICE_WORD.test(x)) && keep.every((x) => ALLOWED.has(x) && !/\d/.test(x));
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
        const days = m.days ? (m.days.min === m.days.max ? `، حدود ${fmtNum(m.days.min)} روز` : `، ${fmtNum(m.days.min)} تا ${fmtNum(m.days.max)} روز`) : "";
        lines.push(`- ${m.nameFa}: هر ${u} ${fmtNum(m.unit)} تومان${days}`);
      }
    }
  }
  lines.push("این قیمت تخمینی است.");
  lines.push(PRICE_REPLY_END);
  return lines.join("\n");
}
