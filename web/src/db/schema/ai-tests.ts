// دستیار هوشمند یارچین، PR دوم (migration ۰۰۱۱): آزمون و چرخه‌ی یادگیری. docs/infoyaarchin.md بخش ۳۳ و docs/db/0011-ai-tests.md
// فقط جدول‌های تازه؛ به جدول‌های قبلی دست نمی‌زند.
import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, check, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_common";
import { aiRequests } from "./ai";
import { users } from "./auth";
import { chatMessages, conversations } from "./chat";

// انتظارهای قابل‌سنجش خودکار یک سؤال آزمون
//   handoff: "none" (نباید ارجاع دهد) | "any" (هر دلیلی) | دلیل مشخص (restricted, proforma, …) | null (مهم نیست)
//   source: منبع مورد انتظار (product | calculator | knowledge | general) یا null
//   forbidden: کلمه‌هایی که جواب نباید داشته باشد؛ mustInclude: کلمه‌هایی که باید داشته باشد
export type TestExpect = { handoff: string | null; source: string | null; forbidden: string[]; mustInclude: string[] };

// سؤال‌های آزمون. category: normal | tricky | handoff. productSlug: صفحه‌ی محصولی که سؤال در آن پرسیده می‌شود (اختیاری).
// مثل پایگاه دانش: تاریخچه در ai_test_case_versions و «آخرین بررسی» جدا از «آخرین ویرایش».
export const aiTestCases = pgTable(
  "ai_test_cases",
  {
    id: id(),
    question: text("question").notNull(),
    // جواب درست / رفتار درست، برای مقایسه‌ی انسانی کنار جواب دستیار
    expectedAnswer: text("expected_answer").notNull().default(""),
    category: text("category", { enum: ["normal", "tricky", "handoff"] })
      .notNull()
      .default("normal"),
    productSlug: text("product_slug"),
    expect: jsonb("expect").$type<TestExpect>().notNull().default({ handoff: null, source: null, forbidden: [], mustInclude: [] }),
    status: text("status", { enum: ["active", "draft"] })
      .notNull()
      .default("active"),
    // seed | manual | suggestion
    source: text("source").notNull().default("manual"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    lastReviewedBy: uuid("last_reviewed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ai_test_cases_status_idx").on(t.status, t.category),
    check("ai_test_cases_category_check", sql`${t.category} in ('normal', 'tricky', 'handoff')`),
    check("ai_test_cases_status_check", sql`${t.status} in ('active', 'draft')`),
  ],
);

export const aiTestCaseVersions = pgTable(
  "ai_test_case_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => aiTestCases.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    expectedAnswer: text("expected_answer").notNull(),
    category: text("category").notNull(),
    productSlug: text("product_slug"),
    expect: jsonb("expect").$type<TestExpect>().notNull(),
    status: text("status").notNull(),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("ai_test_case_versions_case_idx").on(t.caseId, t.createdAt)],
);

// هر اجرای آزمون. status: running | done | stopped | interrupted (سرور وسط کار ری‌استارت شد) | failed
// scope: کدام سؤال‌ها ({kind: all|tricky|handoff|normal|new|failed|selected, ids?}); model و prompt_version برای هشدار «بعد از تغییر اجرا نشده»
export const aiTestRuns = pgTable(
  "ai_test_runs",
  {
    id: id(),
    status: text("status").notNull().default("running"),
    mode: text("mode", { enum: ["live", "test"] }).notNull(),
    scope: jsonb("scope").notNull().default({}),
    model: text("model"),
    promptVersion: text("prompt_version").notNull(),
    total: integer("total").notNull().default(0),
    done: integer("done").notNull().default(0),
    passed: integer("passed").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    estimatedToman: numeric("estimated_toman", { precision: 14, scale: 2 }).notNull().default("0"),
    costToman: numeric("cost_toman", { precision: 14, scale: 2 }).notNull().default("0"),
    stopRequested: boolean("stop_requested").notNull().default(false),
    startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_test_runs_started_idx").on(t.startedAt), check("ai_test_runs_mode_check", sql`${t.mode} in ('live', 'test')`)],
);

// نتیجه‌ی هر سؤال در هر اجرا (متن سؤال و انتظارها لحظه‌ی اجرا هم ذخیره می‌شوند؛ ویرایش بعدی سؤال نتیجه‌ی قدیم را عوض نمی‌کند)
//   status: pending | done | skipped     autoPass: همه‌ی بررسی‌های خودکار درست بود     checks: [{check, ok, detail}]
//   verdict: قضاوت انسان (correct | wrong | null)
export const aiTestResults = pgTable(
  "ai_test_results",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => aiTestRuns.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").references(() => aiTestCases.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    question: text("question").notNull(),
    expectedAnswer: text("expected_answer").notNull().default(""),
    expect: jsonb("expect").$type<TestExpect>().notNull(),
    productSlug: text("product_slug"),
    status: text("status").notNull().default("pending"),
    // مسیر جواب: canned | rule | model | error؛ برای ردشده‌ها دلیل: stop | cap | interrupted
    path: text("path"),
    answer: text("answer"),
    answerSource: text("answer_source"),
    handoffReason: text("handoff_reason"),
    autoPass: boolean("auto_pass"),
    checks: jsonb("checks").notNull().default([]),
    verdict: text("verdict"),
    verdictBy: uuid("verdict_by").references(() => users.id, { onDelete: "set null" }),
    verdictAt: timestamp("verdict_at", { withTimezone: true }),
    requestId: bigint("request_id", { mode: "number" }).references(() => aiRequests.id, { onDelete: "set null" }),
    costToman: numeric("cost_toman", { precision: 14, scale: 2 }).notNull().default("0"),
    latencyMs: integer("latency_ms"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_test_results_run_idx").on(t.runId, t.position),
    index("ai_test_results_case_idx").on(t.caseId, t.createdAt),
    check("ai_test_results_verdict_check", sql`${t.verdict} is null or ${t.verdict} in ('correct', 'wrong')`),
  ],
);

// «پیشنهاد سؤال تازه»: از چت‌های واقعی (بی‌جواب، ارجاع، 👎، جواب اشتباه، تکرار، محافظ، «قاعده‌ی کد نگرفت»)، از نتیجه‌ی «اشتباه» آزمون،
// یا پیشنهاد AI. تکراری‌ها یکی می‌شوند (یکتا روی متن یکسان‌شده‌ی سؤال + نوع؛ هر برچسب جدا شمرده می‌شود). هیچ‌چیز خودکار به
// پایگاه دانش یا آزمون اضافه نمی‌شود؛ با تبدیل یا رد یک ردیف، همه‌ی ردیف‌های باز همان سؤال هم بسته می‌شوند.
//   kind: no_answer | handoff | rule_gap | thumbs_down | wrong | repeated | leak | test_wrong | ai_tricky
//   status: open | kb | test | dismissed
export const aiSuggestions = pgTable(
  "ai_suggestions",
  {
    id: id(),
    questionKey: text("question_key").notNull(),
    question: text("question").notNull(),
    kind: text("kind").notNull(),
    // دلیل دقیق (مثلاً دلیل ارجاع مدل) برای نمایش
    detail: text("detail"),
    count: integer("count").notNull().default(1),
    status: text("status").notNull().default("open"),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    messageId: bigint("message_id", { mode: "number" }).references(() => chatMessages.id, { onDelete: "set null" }),
    // پیوند به چیزی که از این پیشنهاد ساخته شد (kb_items یا ai_test_cases)
    convertedRef: uuid("converted_ref"),
    handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    firstSeenAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_suggestions_key_uq").on(t.questionKey, t.kind),
    index("ai_suggestions_status_idx").on(t.status, t.lastSeenAt),
    check("ai_suggestions_status_check", sql`${t.status} in ('open', 'kb', 'test', 'dismissed')`),
  ],
);
