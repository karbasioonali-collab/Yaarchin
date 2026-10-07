CREATE TABLE "customer_signals" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value_num" numeric(14, 2),
	"value_text" text,
	"source" text DEFAULT 'ai' NOT NULL,
	"confidence" numeric(3, 2),
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_signals_user_id_key_pk" PRIMARY KEY("user_id","key"),
	CONSTRAINT "customer_signals_confidence_check" CHECK ("customer_signals"."confidence" is null or "customer_signals"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "lead_score_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"label_fa" text NOT NULL,
	"points" numeric(8, 2) NOT NULL,
	"cap" numeric(8, 2),
	"window_days" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'admin' NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_score_rules_source_check" CHECK ("lead_score_rules"."source" in ('system', 'admin', 'ai')),
	CONSTRAINT "lead_score_rules_points_check" CHECK ("lead_score_rules"."points" >= 0 and ("lead_score_rules"."cap" is null or "lead_score_rules"."cap" >= 0)),
	CONSTRAINT "lead_score_rules_window_check" CHECK ("lead_score_rules"."window_days" is null or "lead_score_rules"."window_days" between 1 and 3650)
);
--> statement-breakpoint
ALTER TABLE "customer_signals" ADD CONSTRAINT "customer_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_score_rules" ADD CONSTRAINT "lead_score_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_signals_key_idx" ON "customer_signals" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_score_rules_key_uq" ON "lead_score_rules" USING btree ("key");