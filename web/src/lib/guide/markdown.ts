// خواننده‌ی کوچک متن آموزش پنل (web/content/admin-guide.md). docs/infoyaarchin.md بخش ۴۲.
// بدون کتابخانه؛ فقط همان قالبی که متن آموزش دارد:
//   # عنوان صفحه | ## تیتر بخش {#اسم-ثابت} | ### زیرتیتر | «- » فهرست | «۱. » یا «1. » فهرست شماره‌دار | **پررنگ** | خط خالی = پاراگراف تازه
//   <!-- … --> (توضیح برای ویرایشگر) نمایش داده نمی‌شود. HTML خام پشتیبانی نمی‌شود (متن همیشه متن است؛ React escape می‌کند).
export type Inline = { text: string; bold: boolean }[];
export type Block = { type: "p"; text: Inline } | { type: "h3"; text: Inline } | { type: "ul"; items: Inline[] } | { type: "ol"; items: Inline[] };
export type Section = { id: string; title: string; blocks: Block[] };
export type Guide = { title: string; intro: Block[]; sections: Section[] };

export function inline(s: string): Inline {
  const out: Inline = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), bold: false });
  return out;
}

const OL = /^[0-9۰-۹]+[.)]\s+/;

export function parseGuide(md: string): Guide {
  const text = md.replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
  const g: Guide = { title: "", intro: [], sections: [] };
  let blocks = g.intro;
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: Inline[] } | null = null;
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: inline(para.join(" ")) });
    para = [];
    if (list) blocks.push(list);
    list = null;
  };
  const seen = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      blocks.push({ type: "h3", text: inline(line.slice(4).trim()) });
    } else if (line.startsWith("## ")) {
      flush();
      const m = /^##\s+(.*?)\s*(?:\{#([a-z0-9-]+)\})?$/.exec(line)!;
      let id = m[2] ?? `s${g.sections.length + 1}`;
      while (seen.has(id)) id += "-2";
      seen.add(id);
      const sec: Section = { id, title: m[1], blocks: [] };
      g.sections.push(sec);
      blocks = sec.blocks;
    } else if (line.startsWith("# ")) {
      flush();
      g.title = line.slice(2).trim();
    } else if (line.startsWith("- ") || OL.test(line)) {
      const type = line.startsWith("- ") ? "ul" : "ol";
      if (para.length) {
        blocks.push({ type: "p", text: inline(para.join(" ")) });
        para = [];
      }
      if (list && list.type !== type) flush();
      list ??= { type, items: [] };
      list.items.push(inline(type === "ul" ? line.slice(2).trim() : line.replace(OL, "")));
    } else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return g;
}
