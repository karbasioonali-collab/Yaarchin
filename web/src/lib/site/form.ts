// تبدیل فرم پنل «محتوای سایت» به JSON بلوک.
// نام فیلدها مسیر نقطه‌دار است و پیشوندش نوع را می‌گوید:
//   b:nav.visible        ← boolean (یک input مخفی با 0 و یک چک‌باکس با 1؛ اگر 1 بیاید true)
//   n:products.limit     ← عدد
//   l:subjects           ← فهرست متن، هر خط یک مورد (textarea)
//   nav.links.0.label    ← متن؛ بخش عددی مسیر یعنی آرایه
// خروجی بعد از این، از normalize (blocks.ts) رد می‌شود؛ پس فیلد ناشناخته یا خراب به دیتابیس نمی‌رسد.
import { safeHref } from "./blocks";

type Tree = { [k: string]: unknown };

function setPath(root: Tree, path: string[], value: unknown) {
  let cur: Tree = root;
  path.forEach((seg, i) => {
    if (i === path.length - 1) {
      cur[seg] = value;
      return;
    }
    if (typeof cur[seg] !== "object" || cur[seg] === null) cur[seg] = /^\d+$/.test(path[i + 1]) ? [] : {};
    cur = cur[seg] as Tree;
  });
}

// آرایه‌های پراکنده (ردیف‌های خالی) فشرده می‌شوند
function compact(v: unknown): unknown {
  if (Array.isArray(v)) return v.filter((x) => x !== undefined).map(compact);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, compact(x)]));
  return v;
}

export function formToObject(fd: FormData): Tree {
  const out: Tree = {};
  const seen = new Set<string>();
  for (const [rawKey] of fd.entries()) {
    if (seen.has(rawKey) || rawKey.startsWith("$") || rawKey.startsWith("_")) continue;
    seen.add(rawKey);
    const m = /^([bnl]):(.+)$/.exec(rawKey);
    const kind = m?.[1] ?? "s";
    const path = (m?.[2] ?? rawKey).split(".");
    if (path[0] === "__block") continue;
    const values = fd.getAll(rawKey).map((v) => (typeof v === "string" ? v : ""));
    let value: unknown;
    if (kind === "b") value = values.includes("1");
    else if (kind === "n") value = Number(values.at(-1));
    else if (kind === "l") value = (values.at(-1) ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    else value = values.at(-1) ?? "";
    setPath(out, path, value);
  }
  return compact(out) as Tree;
}

// لینک‌هایی که متن دارند ولی آدرسشان پذیرفتنی نیست (تا به‌جای حذف بی‌صدا، خطا نشان داده شود)
export function invalidHrefs(v: unknown, found: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => invalidHrefs(x, found));
  else if (v && typeof v === "object") {
    const o = v as Tree;
    if (typeof o.href === "string" && o.href.trim() && !safeHref(o.href)) found.push(o.href.trim());
    Object.values(o).forEach((x) => invalidHrefs(x, found));
  }
  return found;
}
