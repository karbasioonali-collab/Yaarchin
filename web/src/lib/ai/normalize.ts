// یکسان‌سازی متن فارسی برای جستجو و محافظ (بدون server-only تا تست واحد مستقیم اجرایش کند).
// ي/ى ← ی، ك ← ک، ة ← ه، حذف اعراب و تطویل، ارقام فارسی/عربی ← لاتین، حروف کوچک، فاصله‌ها یکی.
// نیم‌فاصله (ZWNJ) در normFa به فاصله تبدیل می‌شود؛ compact همه‌ی فاصله‌ها و نیم‌فاصله‌ها را برمی‌دارد («علی‌بابا» = «علی بابا» = «علیبابا»).
export function normFa(raw: string): string {
  return raw
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[ؤ]/g, "و")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[‌‍‎‏ ]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const compact = (s: string) => normFa(s).replace(/[\s\-_.]+/g, "");

// کلمه‌های بی‌اثر در جستجو
const STOP = new Set(
  "و در به از که این آن را با برای یک تا هم یا اما اگر چه چی چیه چطور چگونه آیا است هست نیست می شود میشه شما من ما ها های ای رو هست؟ کنم کنید کرد دارید دارم دارین بگید بگو لطفا لطفاً سلام ممنون مرسی".split(
    " ",
  ),
);

export function tokens(s: string): string[] {
  return normFa(s)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(" ")
    .filter((t) => t.length >= 2 && !STOP.has(t));
}
