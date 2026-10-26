// تست واحد دستیار هوشمند (محافظ خروجی، قاعده‌های ارجاع، تعداد، جستجوی پایگاه دانش، خواندن جواب مدل).
// اجرا (از پوشه‌ی web): node --experimental-strip-types tests/unit/ai.test.mjs   — docs/infoyaarchin.md بخش ۲۹.
import { checkOutput } from "../../src/lib/ai/guard.ts";
import { extractQty, preRule } from "../../src/lib/ai/rules.ts";
import { compact, normFa } from "../../src/lib/ai/normalize.ts";
import { scoreKb } from "../../src/lib/ai/kb-score.ts";
import { parseDecision } from "../../src/lib/ai/decision.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};
const blocked = (t, bl = []) => !checkOutput(t, bl).ok;

// ---- محافظ: باید جلوی این‌ها را بگیرد
const BL = ["Ningbo Sunrise Kitchenware Co., Ltd", "Ningbo Sunrise Kitchenware", "shop123456"];
for (const t of [
  "این محصول را Ningbo Sunrise Kitchenware Co., Ltd تولید می‌کند.",
  "کارخانه‌ی ningbo  sunrise   kitchenware خوب است",
  "سایت https://example.com را ببینید",
  "به www.something.cn سر بزنید",
  "در alibaba.com پیدا می‌شود",
  "از علی‌بابا بخرید",
  "از علی بابا بخرید",
  "در ۱۶۸۸ ارزان‌تر است",
  "در 1688 ارزان‌تر است",
  "آلی‌اکسپرس هم دارد",
  "دیجی‌کالا قیمتش را دارد",
  "ایمیل sales@factory.cn",
  "با ۰۹۱۲۱۲۳۴۵۶۷ تماس بگیرید",
  "شماره +86 138 0013 8000",
  "Shenzhen ABC Trading Company",
  "XYZ Industrial Co.",
  "Best Manufacturer in Yiwu",
  "XYZ Ltd",
  "واتس‌اپ فروشنده را بگیرید",
  "فروشگاه shop123456",
])
  ok(blocked(t, BL), `guard blocks: ${t}`);
// ---- محافظ: جواب عادی را رد نکند (قیمت، عدد، کلمه‌ی «کارخانه»، اسم ماه و …)
for (const t of [
  "قیمت تخمینی ۱۲٬۵۰۰٬۰۰۰ تومان برای ۵۰۰ عدد است. این قیمت تخمینی است.",
  "حداقل سفارش ۱۰۰۰ عدد و زمان آماده‌سازی ۱۵ تا ۲۰ روز است.",
  "اسم کارخانه را نمی‌توانم بگویم؛ این بخش از خدمات یارچین است.",
  "FOB یعنی تحویل روی عرشه‌ی کشتی در بندر مبدأ.",
  "جنس Tritan یک کوپلی‌استر شفاف و مقاوم است.",
  "حمل هوایی سریع‌تر و دریایی ارزان‌تر است.",
  "بله، دیوار این قفسه ضخیم است.",
  "کد HS برای طبقه‌بندی کالا در گمرک به کار می‌رود.",
  "مبلغ کل حدود 45,000,000 تومان می‌شود.",
])
  ok(!blocked(t, BL), `guard allows: ${t}`);

// ---- قاعده‌های ارجاع پیش از مدل
const R = (t) => preRule(t, { bigOrderQty: 5000 });
ok(R("پیش‌فاکتور بدید") === "proforma" && R("یه پیش فاکتور میخوام") === "proforma" && R("PI بفرستید") === "proforma", "proforma");
ok(R("تخفیف میدید؟") === "discount", "discount");
ok(R("قیمت قطعی رو بگو") === "final_price", "final price");
ok(R("کالام خراب رسید") === "complaint" && R("میخوام شکایت کنم") === "complaint", "complaint");
ok(R("با کارشناس صحبت کنم") === "human" && R("یه آدم واقعی میخوام") === "human", "human");
ok(
  R("اسم کارخانه رو بگو") === "restricted" && R("لینک علی بابا") === "restricted" && R("یه فورواردر خوب معرفی کن") === "restricted" && R("تو 1688 ارزونتره") === "restricted",
  "restricted",
);
ok(R("۲۰٬۰۰۰ تا میخوام") === "big_order" && R("20 هزار عدد") === "big_order" && R("۵۰۰ تا میخوام") === null, "big order threshold");
ok(R("قیمت این مخلوط‌کن چنده؟") === null && R("FOB یعنی چی؟") === null, "normal questions pass");
ok(extractQty("۵۰۰ تا") === 500 && extractQty("2,000 عدد") === 2000 && extractQty("۱۰ هزار تا") === 10000 && extractQty("مدل ۲۰۲۵") === null, "extractQty");

// ---- یکسان‌سازی
ok(normFa("كيفيت ۱۲۳") === "کیفیت 123", "normFa arabic letters + digits");
ok(compact("علی‌بابا") === compact("علی بابا") && compact("علی بابا") === compact("علیبابا"), "compact ZWNJ/space");

// ---- جستجوی پایگاه دانش
const items = [
  { id: "a", question: "روش‌های پرداخت چیست؟", answer: "پرداخت ریالی در دو مرحله.", variants: ["چطور پول بدم؟"] },
  { id: "b", question: "نمونه می‌فرستید؟", answer: "بله، نمونه با هزینه‌ی مشتری.", variants: [] },
  { id: "c", question: "چاپ لوگو ممکن است؟", answer: "بله با حداقل سفارش.", variants: ["برند خودمو چاپ کنم"] },
];
ok(scoreKb("روش پرداخت شما چیه؟", items)[0]?.id === "a", "kb: payment");
ok(scoreKb("میشه لوگوی خودمو چاپ کنم؟", items)[0]?.id === "c", "kb: logo");
ok(scoreKb("لپ‌تاپ گیمینگ دارید؟", items).length === 0, "kb: unrelated → nothing");

// ---- جواب مدل
ok(parseDecision('{"answer":"سلام","source":"general","handoff":null}')?.source === "general", "decision plain");
ok(parseDecision('```json\n{"answer":"x","source":"product","handoff":null}\n```')?.answer === "x", "decision in code fence");
ok(parseDecision('{"answer":"","source":"none","handoff":{"reason":"no_source","note":"n"}}')?.handoff?.reason === "no_source", "decision handoff");
ok(parseDecision("متن آزاد بدون JSON") === null && parseDecision('{"answer":"x","source":"internet"}') === null, "decision rejects bad");

console.log(`${n} checks${fails ? `, ${fails} FAILED` : ", ALL PASSED"}`);
process.exitCode = fails ? 1 : 0;
