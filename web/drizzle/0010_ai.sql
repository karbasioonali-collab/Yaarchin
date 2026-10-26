CREATE TABLE "ai_conversation_state" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'ai' NOT NULL,
	"replies" integer DEFAULT 0 NOT NULL,
	"thinking_since" timestamp with time zone,
	"silenced_at" timestamp with time zone,
	"silenced_reason" text,
	"silenced_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_conversation_state_mode_check" CHECK ("ai_conversation_state"."mode" in ('ai', 'human'))
);
--> statement-breakpoint
CREATE TABLE "ai_feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"message_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"value" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_feedback_source_check" CHECK ("ai_feedback"."source" in ('customer', 'staff')),
	CONSTRAINT "ai_feedback_value_check" CHECK ("ai_feedback"."value" in ('up', 'down', 'wrong'))
);
--> statement-breakpoint
CREATE TABLE "ai_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purpose" text NOT NULL,
	"mode" text NOT NULL,
	"conversation_id" uuid,
	"message_id" bigint,
	"reply_message_id" bigint,
	"model" text,
	"fallback_used" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"outcome" text,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_toman" numeric(14, 2) DEFAULT '0' NOT NULL,
	"latency_ms" integer,
	"error" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "ai_requests_mode_check" CHECK ("ai_requests"."mode" in ('live', 'test')),
	CONSTRAINT "ai_requests_tokens_check" CHECK ("ai_requests"."prompt_tokens" >= 0 and "ai_requests"."completion_tokens" >= 0 and "ai_requests"."cost_toman" >= 0)
);
--> statement-breakpoint
CREATE TABLE "kb_item_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" text,
	"status" text NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"last_reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_items_status_check" CHECK ("kb_items"."status" in ('active', 'draft'))
);
--> statement-breakpoint
ALTER TABLE "ai_conversation_state" ADD CONSTRAINT "ai_conversation_state_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversation_state" ADD CONSTRAINT "ai_conversation_state_silenced_by_users_id_fk" FOREIGN KEY ("silenced_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_reply_message_id_chat_messages_id_fk" FOREIGN KEY ("reply_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_item_versions" ADD CONSTRAINT "kb_item_versions_item_id_kb_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."kb_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_item_versions" ADD CONSTRAINT "kb_item_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_items" ADD CONSTRAINT "kb_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_items" ADD CONSTRAINT "kb_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_items" ADD CONSTRAINT "kb_items_last_reviewed_by_users_id_fk" FOREIGN KEY ("last_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversation_state_mode_idx" ON "ai_conversation_state" USING btree ("mode");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_feedback_uq" ON "ai_feedback" USING btree ("message_id","user_id","source");--> statement-breakpoint
CREATE INDEX "ai_feedback_created_idx" ON "ai_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_requests_created_idx" ON "ai_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_requests_conversation_idx" ON "ai_requests" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "kb_item_versions_item_idx" ON "kb_item_versions" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "kb_items_status_idx" ON "kb_items" USING btree ("status","last_reviewed_at");