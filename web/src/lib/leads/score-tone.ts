// رنگ امتیاز جدیت در پنل (بخش ۵۰؛ خالص): زیر ۵۰ خاکستری، ۵۰ تا ۷۹ نارنجی (#FF7A00)، ۸۰ به بالا سبز (#2F7D5C)
export type ScoreTone = "low" | "mid" | "high";
export const scoreTone = (score: number): ScoreTone => (score >= 80 ? "high" : score >= 50 ? "mid" : "low");
export const SCORE_TONE_STYLE: Record<ScoreTone, { background: string; color: string }> = {
  low: { background: "rgba(34, 34, 34, .07)", color: "#5F5F5F" },
  mid: { background: "rgba(255, 122, 0, .14)", color: "#B85400" },
  high: { background: "rgba(47, 125, 92, .14)", color: "#2F7D5C" },
};
