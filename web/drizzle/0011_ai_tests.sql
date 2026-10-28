CREATE TABLE "ai_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_key" text NOT NULL,
	"question" text NOT NULL,
	"kind" text NOT NULL,
	"detail" text,
	"count" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"conversation_id" uuid,
	"message_id" bigint,
	"converted_ref" uuid,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_suggestions_status_check" CHECK ("ai_suggestions"."status" in ('open', 'kb', 'test', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "ai_test_case_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"question" text NOT NULL,
	"expected_answer" text NOT NULL,
	"category" text NOT NULL,
	"product_slug" text,
	"expect" jsonb NOT NULL,
	"status" text NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"expected_answer" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'normal' NOT NULL,
	"product_slug" text,
	"expect" jsonb DEFAULT '{"handoff":null,"source":null,"forbidden":[],"mustInclude":[]}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"last_reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_test_cases_category_check" CHECK ("ai_test_cases"."category" in ('normal', 'tricky', 'handoff')),
	CONSTRAINT "ai_test_cases_status_check" CHECK ("ai_test_cases"."status" in ('active', 'draft'))
);
--> statement-breakpoint
CREATE TABLE "ai_test_results" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"case_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"question" text NOT NULL,
	"expected_answer" text DEFAULT '' NOT NULL,
	"expect" jsonb NOT NULL,
	"product_slug" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"path" text,
	"answer" text,
	"answer_source" text,
	"handoff_reason" text,
	"auto_pass" boolean,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verdict" text,
	"verdict_by" uuid,
	"verdict_at" timestamp with time zone,
	"request_id" bigint,
	"cost_toman" numeric(14, 2) DEFAULT '0' NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_test_results_verdict_check" CHECK ("ai_test_results"."verdict" is null or "ai_test_results"."verdict" in ('correct', 'wrong'))
);
--> statement-breakpoint
CREATE TABLE "ai_test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"mode" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text,
	"prompt_version" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"estimated_toman" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cost_toman" numeric(14, 2) DEFAULT '0' NOT NULL,
	"stop_requested" boolean DEFAULT false NOT NULL,
	"started_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_test_runs_mode_check" CHECK ("ai_test_runs"."mode" in ('live', 'test'))
);
--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_test_case_versions" ADD CONSTRAINT "ai_test_case_versions_case_id_ai_test_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."ai_test_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_test_case_versions" ADD CONSTRAINT "ai_test_case_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_test_cases" ADD CONSTRAINT "ai_test_cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_test_cases" ADD CONSTRAINT "ai_test_cases_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_test_cases" ADD CONSTRAINT "ai_test_cases_last_reviewed_by_users_id_fk" FOREIGN KEY ("last_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_test_results" ADD CONSTRAINT "ai_test_results_run_id_ai_test_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_test_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_test_results" ADD CONSTRAINT "ai_test_results_case_id_ai_test_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."ai_test_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_test_results" ADD CONSTRAINT "ai_test_results_verdict_by_users_id_fk" FOREIGN KEY ("verdict_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_test_results" ADD CONSTRAINT "ai_test_results_request_id_ai_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ai_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_test_runs" ADD CONSTRAINT "ai_test_runs_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_suggestions_key_uq" ON "ai_suggestions" USING btree ("question_key","kind");--> statement-breakpoint
CREATE INDEX "ai_suggestions_status_idx" ON "ai_suggestions" USING btree ("status","last_seen_at");--> statement-breakpoint
CREATE INDEX "ai_test_case_versions_case_idx" ON "ai_test_case_versions" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_test_cases_status_idx" ON "ai_test_cases" USING btree ("status","category");--> statement-breakpoint
CREATE INDEX "ai_test_results_run_idx" ON "ai_test_results" USING btree ("run_id","position");--> statement-breakpoint
CREATE INDEX "ai_test_results_case_idx" ON "ai_test_results" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_test_runs_started_idx" ON "ai_test_runs" USING btree ("started_at");