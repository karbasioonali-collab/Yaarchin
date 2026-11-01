CREATE TABLE "raw_page_edits" (
	"raw_page_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raw_page_edits" ADD CONSTRAINT "raw_page_edits_raw_page_id_raw_pages_id_fk" FOREIGN KEY ("raw_page_id") REFERENCES "public"."raw_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_page_edits" ADD CONSTRAINT "raw_page_edits_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;