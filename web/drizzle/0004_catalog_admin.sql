CREATE TABLE "company_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"phone" text,
	"email" text,
	"wechat" text,
	"whatsapp" text,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_correspondence" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_id" uuid,
	"product_id" uuid,
	"listing_id" uuid,
	"kind" text DEFAULT 'note' NOT NULL,
	"channel" text DEFAULT 'other' NOT NULL,
	"direction" text DEFAULT 'internal' NOT NULL,
	"body" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_ref" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_correspondence_kind_check" CHECK ("company_correspondence"."kind" in ('note', 'chat_summary', 'chat_message', 'email', 'call')),
	CONSTRAINT "company_correspondence_channel_check" CHECK ("company_correspondence"."channel" in ('alibaba_chat', 'email', 'wechat', 'whatsapp', 'phone', 'other')),
	CONSTRAINT "company_correspondence_direction_check" CHECK ("company_correspondence"."direction" in ('inbound', 'outbound', 'internal'))
);
--> statement-breakpoint
CREATE TABLE "lead_time_observations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"min_qty" integer,
	"max_qty" integer,
	"days" integer NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_time_observations_days_check" CHECK ("lead_time_observations"."days" > 0 and "lead_time_observations"."days" <= 730)
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit_weight_kg" numeric(10, 3);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "carton_length_cm" numeric(8, 1);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "carton_width_cm" numeric(8, 1);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "carton_height_cm" numeric(8, 1);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "carton_weight_kg" numeric(10, 3);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "units_per_carton" integer;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_correspondence" ADD CONSTRAINT "company_correspondence_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_correspondence" ADD CONSTRAINT "company_correspondence_contact_id_company_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."company_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_correspondence" ADD CONSTRAINT "company_correspondence_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_correspondence" ADD CONSTRAINT "company_correspondence_listing_id_product_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."product_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_correspondence" ADD CONSTRAINT "company_correspondence_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_time_observations" ADD CONSTRAINT "lead_time_observations_listing_id_product_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."product_listings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_time_observations" ADD CONSTRAINT "lead_time_observations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_contacts_company_idx" ON "company_contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_correspondence_company_idx" ON "company_correspondence" USING btree ("company_id","occurred_at");--> statement-breakpoint
CREATE INDEX "company_correspondence_product_idx" ON "company_correspondence" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_correspondence_ref_uq" ON "company_correspondence" USING btree ("company_id","source","external_ref") WHERE "company_correspondence"."external_ref" is not null;--> statement-breakpoint
CREATE INDEX "lead_time_observations_listing_idx" ON "lead_time_observations" USING btree ("listing_id","observed_at");--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_currency_check" CHECK ("price_observations"."currency" in ('USD', 'CNY'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_packing_check" CHECK (("products"."unit_weight_kg" is null or "products"."unit_weight_kg" > 0) and ("products"."carton_length_cm" is null or "products"."carton_length_cm" > 0)
        and ("products"."carton_width_cm" is null or "products"."carton_width_cm" > 0) and ("products"."carton_height_cm" is null or "products"."carton_height_cm" > 0)
        and ("products"."carton_weight_kg" is null or "products"."carton_weight_kg" > 0) and ("products"."units_per_carton" is null or "products"."units_per_carton" > 0));