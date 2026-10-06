CREATE TABLE "media_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"storage" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"variants" jsonb,
	"sha256" text NOT NULL,
	"original_name" text,
	"source" text DEFAULT 'upload' NOT NULL,
	"source_url" text,
	"purpose" text NOT NULL,
	"logo_check" text DEFAULT 'unchecked' NOT NULL,
	"logo_check_at" timestamp with time zone,
	"logo_check_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_files_storage_check" CHECK ("media_files"."storage" in ('local', 's3')),
	CONSTRAINT "media_files_kind_check" CHECK ("media_files"."kind" in ('image', 'video')),
	CONSTRAINT "media_files_source_check" CHECK ("media_files"."source" in ('upload', 'url', 'extension')),
	CONSTRAINT "media_files_logo_check_check" CHECK ("media_files"."logo_check" in ('unchecked', 'pending', 'clean', 'has_logo', 'error')),
	CONSTRAINT "media_files_bytes_check" CHECK ("media_files"."bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_files_key_uq" ON "media_files" USING btree ("key");--> statement-breakpoint
CREATE INDEX "media_files_sha256_idx" ON "media_files" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "media_files_created_idx" ON "media_files" USING btree ("created_at");