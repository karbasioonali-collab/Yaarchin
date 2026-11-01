CREATE TABLE "product_text_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"status" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"guard_hits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_request_id" bigint,
	"cost_toman" numeric(14, 2) DEFAULT '0' NOT NULL,
	"model" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_text_drafts_status_check" CHECK ("product_text_drafts"."status" in ('ready', 'blocked', 'error'))
);
--> statement-breakpoint
ALTER TABLE "product_text_drafts" ADD CONSTRAINT "product_text_drafts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_text_drafts" ADD CONSTRAINT "product_text_drafts_ai_request_id_ai_requests_id_fk" FOREIGN KEY ("ai_request_id") REFERENCES "public"."ai_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_text_drafts" ADD CONSTRAINT "product_text_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_text_drafts_product_idx" ON "product_text_drafts" USING btree ("product_id","created_at");