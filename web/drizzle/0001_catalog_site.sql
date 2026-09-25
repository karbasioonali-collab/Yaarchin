CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"slug" text NOT NULL,
	"name_fa" text NOT NULL,
	"name_en" text,
	"description_fa" text,
	"image" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_type" text DEFAULT 'unknown' NOT NULL,
	"name_en" text NOT NULL,
	"name_fa" text,
	"country" text DEFAULT 'CN' NOT NULL,
	"province" text,
	"city" text,
	"address" text,
	"website" text,
	"user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"merged_into_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_categories" (
	"company_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_categories_company_id_category_id_pk" PRIMARY KEY("company_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "company_external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_observations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"unit" text DEFAULT 'piece' NOT NULL,
	"min_qty" integer,
	"max_qty" integer,
	"price_min" numeric(14, 4) NOT NULL,
	"price_max" numeric(14, 4),
	"source" text DEFAULT 'manual' NOT NULL,
	"raw_page_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"company_id" uuid NOT NULL,
	"external_url" text,
	"title_en" text,
	"moq" integer,
	"moq_unit" text,
	"lead_time_days" integer,
	"specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"listing_id" uuid,
	"kind" text DEFAULT 'image' NOT NULL,
	"storage_key" text NOT NULL,
	"poster_key" text,
	"width" integer,
	"height" integer,
	"alt_fa" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" text DEFAULT 'combined' NOT NULL,
	"category_id" uuid,
	"title_fa" text NOT NULL,
	"title_en" text,
	"summary_fa" text,
	"description_fa" text,
	"specs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_unit" text DEFAULT 'piece' NOT NULL,
	"hs_code" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"mobile" text,
	"email" text,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_blocks" (
	"key" text PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_merged_into_id_companies_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_categories" ADD CONSTRAINT "company_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_categories" ADD CONSTRAINT "company_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_external_ids" ADD CONSTRAINT "company_external_ids_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_listing_id_product_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."product_listings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_listings" ADD CONSTRAINT "product_listings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_listings" ADD CONSTRAINT "product_listings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_listing_id_product_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."product_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_blocks" ADD CONSTRAINT "site_blocks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "companies_status_idx" ON "companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "company_categories_category_idx" ON "company_categories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_external_ids_uq" ON "company_external_ids" USING btree ("platform","external_id");--> statement-breakpoint
CREATE INDEX "company_external_ids_company_idx" ON "company_external_ids" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "price_observations_listing_idx" ON "price_observations" USING btree ("listing_id","observed_at");--> statement-breakpoint
CREATE INDEX "product_listings_product_idx" ON "product_listings" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "product_listings_company_idx" ON "product_listings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "product_media_product_idx" ON "product_media" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "contact_messages_status_idx" ON "contact_messages" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "contact_messages_ip_idx" ON "contact_messages" USING btree ("ip","created_at");