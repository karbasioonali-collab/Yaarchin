// تست واحد خواننده‌ی متن آموزش پنل و خود متن (web/content/admin-guide.md). docs/infoyaarchin.md بخش ۴۲.
import { readFileSync } from "node:fs";
import { inline, parseGuide } from "../../src/lib/guide/markdown.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};

const g = parseGuide(`# عنوان
<!-- توضیح
چندخطی -->
مقدمه
ادامه‌ی مقدمه

## بخش یک {#one}
پاراگراف **پررنگ** و عادی.
- مورد ۱
- مورد ۲
۱. اول
2. دوم

### زیر
متن
## بخش بی‌اسم
## دوباره {#one}
`);
ok(g.title === "عنوان", "title");
ok(g.intro.length === 1 && g.intro[0].type === "p" && g.intro[0].text[0].text === "مقدمه ادامه‌ی مقدمه", "intro paragraph joined, comment dropped");
ok(g.sections.length === 3 && g.sections[0].id === "one" && g.sections[0].title === "بخش یک", "section id from {#…}");
const b = g.sections[0].blocks;
ok(b[0].type === "p" && b[0].text.some((x) => x.bold && x.text === "پررنگ"), "bold inline");
ok(b[1].type === "ul" && b[1].items.length === 2, "bullet list");
ok(b[2].type === "ol" && b[2].items.length === 2 && b[2].items[0][0].text === "اول", "ordered list with Persian and Latin digits");
ok(b[3].type === "h3" && b[4].type === "p", "h3 + paragraph");
ok(g.sections[1].id === "s2" && g.sections[2].id === "one-2", "fallback and duplicate ids");
ok(JSON.stringify(inline("<b>x</b>")) === JSON.stringify([{ text: "<b>x</b>", bold: false }]), "raw HTML stays text");

// خود متن آموزش: همه‌ی بخش‌های منو اسم ثابت دارند و هیچ اصطلاح فنی در متن نیست
const real = parseGuide(readFileSync(new URL("../../content/admin-guide.md", import.meta.url), "utf8"));
const ids = real.sections.map((s) => s.id);
const MENU = [
  "dashboard",
  "users",
  "customers",
  "chats",
  "inquiries",
  "reports",
  "ai",
  "knowledge",
  "ai-tests",
  "suggestions",
  "roles",
  "products",
  "import",
  "categories",
  "companies",
  "rates",
  "site",
  "messages",
  "activity",
  "sms",
  "settings",
];
ok(
  MENU.every((x) => ids.includes(x)),
  `every menu item has a section (${MENU.filter((x) => !ids.includes(x))})`,
);
ok(new Set(ids).size === ids.length && !ids.some((x) => /^s\d+$/.test(x)), "all sections have explicit unique ids");
const raw = readFileSync(new URL("../../content/admin-guide.md", import.meta.url), "utf8").replace(/<!--[\s\S]*?-->/g, "");
ok(!/migration|\bAPI\b|\bseed\b|database|دیتابیس|سرور|کنسول/i.test(raw), "no technical terms in the guide text");
ok(real.title === "آموزش پنل یارچین" && real.intro.length >= 2, "title and intro");

console.log(`${n} checks${fails ? `, ${fails} FAILED` : ", ALL PASSED"}`);
process.exitCode = fails ? 1 : 0;
