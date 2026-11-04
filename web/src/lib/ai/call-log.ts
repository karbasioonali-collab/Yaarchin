// یک تلاش (درخواست) به مدل برای لاگ (بخش ۴۵): زمان، توکن، دلیل پایان (stop | length | tool_calls)، خطا. خالص (بدون server-only).
export type CallLog = {
  which: "primary" | "fallback";
  ms: number;
  finish?: string | null;
  inTok?: number;
  outTok?: number;
  tool?: boolean;
  error?: string;
  reminder?: "format" | "length";
};
