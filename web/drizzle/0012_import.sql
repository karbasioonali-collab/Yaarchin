CREATE TABLE "listing_external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_page_images" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raw_page_id" uuid NOT NULL,
	"url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"mime" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"bytes" "bytea",
	"storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raw_page_images_where_check" CHECK (("raw_page_images"."bytes" is not null) <> ("raw_page_images"."storage_key" is not null))
);
--> statement-breakpoint
CREATE TABLE "raw_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"platform" text DEFAULT 'alibaba' NOT NULL,
	"url" text,
	"external_product_id" text,
	"store_id" text,
	"title" text,
	"sha256" text NOT NULL,
	"file_name" text,
	"file_bytes" integer DEFAULT 0 NOT NULL,
	"html_gz" "bytea" NOT NULL,
	"html_bytes" integer DEFAULT 0 NOT NULL,
	"resources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parsed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parser_version" integer NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"reject_reason" text,
	"listing_id" uuid,
	"company_id" uuid,
	"product_id" uuid,
	"uploaded_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raw_pages_status_check" CHECK ("raw_pages"."status" in ('new', 'reviewed', 'imported', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "listing_external_ids" ADD CONSTRAINT "listing_external_ids_listing_id_product_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."product_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_page_images" ADD CONSTRAINT "raw_page_images_raw_page_id_raw_pages_id_fk" FOREIGN KEY ("raw_page_id") REFERENCES "public"."raw_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_pages" ADD CONSTRAINT "raw_pages_listing_id_product_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."product_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_pages" ADD CONSTRAINT "raw_pages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_pages" ADD CONSTRAINT "raw_pages_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_pages" ADD CONSTRAINT "raw_pages_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_pages" ADD CONSTRAINT "raw_pages_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_external_ids_uq" ON "listing_external_ids" USING btree ("platform","external_id");--> statement-breakpoint
CREATE INDEX "listing_external_ids_listing_idx" ON "listing_external_ids" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_page_images_page_url_uq" ON "raw_page_images" USING btree ("raw_page_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_pages_sha256_uq" ON "raw_pages" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "raw_pages_status_idx" ON "raw_pages" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "raw_pages_product_idx" ON "raw_pages" USING btree ("platform","external_product_id");--> statement-breakpoint
CREATE INDEX "raw_pages_store_idx" ON "raw_pages" USING btree ("platform","store_id");