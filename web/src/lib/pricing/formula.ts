// فرمول ساده‌ی هزینه‌ها (بدون کدنویسی و بدون eval). متن فرمول در cost_item_versions.formula ذخیره می‌شود و هر بار
// با همین parser خوانده می‌شود؛ هیچ‌وقت به‌شکل کد جاوااسکریپت اجرا نمی‌شود، پس فرمول نمی‌تواند به چیزی جز متغیرهای
// آماده دسترسی داشته باشد.
//   مجاز: عدد (ارقام فارسی هم)، + − × ÷ * /، پرانتز، متغیرهای VARIABLES و تابع‌های max، min، ceil، floor، round
//   مثال: max(۵۰۰۰۰۰، وزن × ۲۰۰۰۰)     ارزش_کالا × ۰٫۰۰۵ + ۱۰۰۰۰۰
// بدون server-only تا فرم پنل و تست هم بتوانند استفاده کنند.
import { toLatinDigits } from "@/lib/validation";

export const VARIABLES = {
  goods_value: { fa: "ارزش_کالا", label: "ارزش کالا (به ارز همین آیتم)" },
  shipping: { fa: "هزینه_حمل", label: "هزینه‌ی حمل همان روش (به ارز همین آیتم)" },
  weight: { fa: "وزن", label: "وزن واقعی کل (کیلو)" },
  chargeable_weight: { fa: "وزن_قابل_محاسبه", label: "وزن قابل‌محاسبه‌ی حمل (کیلو)" },
  volume: { fa: "حجم", label: "حجم کل (متر مکعب)" },
  qty: { fa: "تعداد", label: "تعداد سفارش" },
  cartons: { fa: "کارتن", label: "تعداد کارتن" },
} as const;
export type VarName = keyof typeof VARIABLES;
export type FormulaVars = Partial<Record<VarName, number | null>>;

const FA_TO_VAR = new Map<string, VarName>(Object.entries(VARIABLES).map(([k, v]) => [v.fa, k as VarName]));
const FUNCS: Record<string, (args: number[]) => number> = {
  max: (a) => Math.max(...a),
  min: (a) => Math.min(...a),
  ceil: (a) => Math.ceil(a[0]),
  floor: (a) => Math.floor(a[0]),
  round: (a) => Math.round(a[0]),
};
const FUNC_ARITY: Record<string, [number, number]> = { max: [1, 20], min: [1, 20], ceil: [1, 1], floor: [1, 1], round: [1, 1] };

type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: VarName }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: "+" | "-" | "*" | "/"; a: Node; b: Node }
  | { t: "call"; fn: string; args: Node[] };

type Tok = { k: "num"; v: number } | { k: "id"; v: string } | { k: "op"; v: string };

const MAX_LEN = 500;

function tokenize(src: string): Tok[] {
  // ارقام فارسی/عربی ← لاتین؛ «٫» ممیز فارسی؛ «،» جداکننده‌ی آرگومان؛ × و ÷
  const s = toLatinDigits(src).replace(/٫/g, ".").replace(/،/g, ",").replace(/×/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-");
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      if (!/^(\d+(\.\d+)?|\.\d+)$/.test(raw)) throw new FormulaError(`عدد نامعتبر: ${raw}`);
      out.push({ k: "num", v: Number(raw) });
      i = j;
      continue;
    }
    if ("+-*/(),".includes(c)) {
      out.push({ k: "op", v: c });
      i++;
      continue;
    }
    // اسم متغیر یا تابع: حروف فارسی/انگلیسی، خط زیر و نیم‌فاصله
    if (/[\p{L}_‌]/u.test(c)) {
      let j = i;
      while (j < s.length && /[\p{L}\p{N}_‌]/u.test(s[j])) j++;
      out.push({ k: "id", v: s.slice(i, j).replace(/‌/g, "_") });
      i = j;
      continue;
    }
    throw new FormulaError(`نویسه‌ی مجاز نیست: «${c}»`);
  }
  return out;
}

export class FormulaError extends Error {}

// parser بازگشتی ساده: expr = term (('+'|'-') term)* ; term = unary (('*'|'/') unary)* ; unary = '-' unary | primary
function parse(src: string): Node {
  if (src.length > MAX_LEN) throw new FormulaError(`فرمول حداکثر ${MAX_LEN} نویسه.`);
  const toks = tokenize(src);
  if (!toks.length) throw new FormulaError("فرمول خالی است.");
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.k === "op" && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`«${v}» جا افتاده است.`);
    p++;
  };
  let depth = 0;

  function expr(): Node {
    if (++depth > 50) throw new FormulaError("فرمول بیش از حد تودرتوست.");
    let n = term();
    while (isOp("+") || isOp("-")) {
      const op = (toks[p++] as { v: "+" | "-" }).v;
      n = { t: "bin", op, a: n, b: term() };
    }
    depth--;
    return n;
  }
  function term(): Node {
    let n = unary();
    while (isOp("*") || isOp("/")) {
      const op = (toks[p++] as { v: "*" | "/" }).v;
      n = { t: "bin", op, a: n, b: unary() };
    }
    return n;
  }
  function unary(): Node {
    if (isOp("-")) {
      p++;
      return { t: "neg", a: unary() };
    }
    if (isOp("+")) {
      p++;
      return unary();
    }
    return primary();
  }
  function primary(): Node {
    const tk = peek();
    if (!tk) throw new FormulaError("فرمول ناقص تمام شده است.");
    if (tk.k === "num") {
      p++;
      return { t: "num", v: tk.v };
    }
    if (tk.k === "op" && tk.v === "(") {
      p++;
      const n = expr();
      expect(")");
      return n;
    }
    if (tk.k === "id") {
      p++;
      const name = tk.v.toLowerCase();
      if (isOp("(")) {
        if (!FUNCS[name]) throw new FormulaError(`تابع ناشناخته: ${tk.v} (مجاز: ${Object.keys(FUNCS).join("، ")})`);
        p++;
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(expr());
          while (isOp(",")) {
            p++;
            args.push(expr());
          }
        }
        expect(")");
        const [lo, hi] = FUNC_ARITY[name];
        if (args.length < lo || args.length > hi) throw new FormulaError(`تعداد ورودی‌های ${name} درست نیست.`);
        return { t: "call", fn: name, args };
      }
      const v = FA_TO_VAR.get(tk.v) ?? (name in VARIABLES ? (name as VarName) : undefined);
      if (!v) throw new FormulaError(`متغیر ناشناخته: ${tk.v}`);
      return { t: "var", name: v };
    }
    throw new FormulaError(`«${tk.v}» اینجا مجاز نیست.`);
  }

  const n = expr();
  if (p < toks.length) throw new FormulaError(`بعد از پایان فرمول چیز اضافه هست: «${(toks[p] as { v: unknown }).v}»`);
  return n;
}

function usedVars(n: Node, out = new Set<VarName>()): Set<VarName> {
  if (n.t === "var") out.add(n.name);
  else if (n.t === "neg") usedVars(n.a, out);
  else if (n.t === "bin") {
    usedVars(n.a, out);
    usedVars(n.b, out);
  } else if (n.t === "call") for (const a of n.args) usedVars(a, out);
  return out;
}

function evalNode(n: Node, vars: FormulaVars): number {
  switch (n.t) {
    case "num":
      return n.v;
    case "var": {
      const v = vars[n.name];
      if (v == null) throw new FormulaError(`مقدار «${VARIABLES[n.name].fa}» معلوم نیست.`);
      return v;
    }
    case "neg":
      return -evalNode(n.a, vars);
    case "bin": {
      const a = evalNode(n.a, vars);
      const b = evalNode(n.b, vars);
      if (n.op === "/" && b === 0) throw new FormulaError("تقسیم بر صفر.");
      return n.op === "+" ? a + b : n.op === "-" ? a - b : n.op === "*" ? a * b : a / b;
    }
    case "call":
      return FUNCS[n.fn](n.args.map((x) => evalNode(x, vars)));
  }
}

export type Compiled = { vars: VarName[]; evaluate: (vars: FormulaVars) => number };

// خطای نحوی ← FormulaError با پیام فارسی
export function compileFormula(src: string): Compiled {
  const ast = parse(src.trim());
  return {
    vars: [...usedVars(ast)],
    evaluate: (vars) => {
      const r = evalNode(ast, vars);
      if (!Number.isFinite(r)) throw new FormulaError("نتیجه‌ی فرمول عدد معتبر نیست.");
      if (r < 0) throw new FormulaError("نتیجه‌ی فرمول منفی شد.");
      return r;
    },
  };
}

// برای ذخیره: فرمول درست است و با مقدارهای نمونه یک عدد نامنفی می‌دهد؟ (null = درست)
export const SAMPLE_VARS: Required<FormulaVars> = { goods_value: 5000, shipping: 800, weight: 350, chargeable_weight: 400, volume: 2.4, qty: 1000, cartons: 42 };
export function formulaError(src: string): string | null {
  try {
    compileFormula(src).evaluate(SAMPLE_VARS);
    return null;
  } catch (e) {
    if (e instanceof FormulaError) return e.message;
    throw e;
  }
}
