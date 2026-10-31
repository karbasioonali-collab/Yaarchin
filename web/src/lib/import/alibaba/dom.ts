// کمک‌های کوچک برای پیمایش DOM ساخته‌شده با htmlparser2 (بدون domutils؛ فقط چیزی که خواننده لازم دارد).
import { parseDocument } from "htmlparser2";

// شکل گره‌های domhandler (فقط فیلدهایی که لازم داریم)
export type DomNode = { type: string; name?: string; attribs?: Record<string, string>; children?: DomNode[]; data?: string; parent?: DomNode | null };
export type El = DomNode & { name: string; attribs: Record<string, string>; children: DomNode[] };

export const parseHtml = (html: string): DomNode => parseDocument(html, { decodeEntities: true }) as unknown as DomNode;

export const isEl = (n: DomNode): n is El => (n.type === "tag" || n.type === "script" || n.type === "style") && !!n.name;

export function* walk(n: DomNode): Generator<DomNode> {
  yield n;
  for (const c of n.children ?? []) yield* walk(c);
}

export const els = (root: DomNode, pred: (e: El) => boolean): El[] => {
  const out: El[] = [];
  for (const n of walk(root)) if (isEl(n) && pred(n)) out.push(n);
  return out;
};
export const byAttr = (root: DomNode, attr: string, value: string) => els(root, (e) => e.attribs[attr] === value);
export const first = (root: DomNode, attr: string, value: string): El | null => byAttr(root, attr, value)[0] ?? null;
export const byTag = (root: DomNode, tag: string) => els(root, (e) => e.name === tag);

const SKIP = new Set(["script", "style", "svg", "noscript", "template"]);
// متن گره با فاصله بین تکه‌ها (بدون script/style/svg)
export function text(n: DomNode | null): string {
  if (!n) return "";
  const parts: string[] = [];
  const rec = (x: DomNode) => {
    if (x.type === "text") {
      const t = (x.data ?? "").replace(/\s+/g, " ").trim();
      if (t) parts.push(t);
    } else if (!isEl(x) || !SKIP.has(x.name)) for (const c of x.children ?? []) rec(c);
  };
  rec(n);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// تکه‌های متنی جدا (برای کارت‌هایی که برچسب و مقدار در گره‌های جدا هستند)
export function texts(n: DomNode | null): string[] {
  const out: string[] = [];
  if (!n) return out;
  for (const x of walk(n)) {
    if (x.type !== "text") continue;
    let p = x.parent;
    let skip = false;
    while (p) {
      if (isEl(p) && SKIP.has(p.name)) skip = true;
      p = p.parent;
    }
    const t = (x.data ?? "").replace(/\s+/g, " ").trim();
    if (t && !skip) out.push(t);
  }
  return out;
}

// آیا گره داخل «محصولات پیشنهادی» است؟ (ماژول‌های پیشنهادی، یا هر data-testid که recommend دارد)
export function insideRecommendation(n: DomNode, modules: Set<string>): boolean {
  for (let p = n.parent; p; p = p.parent) if (isEl(p) && (modules.has(p.attribs["data-module-name"] ?? "") || /recommend/i.test(p.attribs["data-testid"] ?? ""))) return true;
  return false;
}
