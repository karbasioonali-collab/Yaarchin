CREATE TABLE "cost_item_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"calc_type" text NOT NULL,
	"amount" numeric(18, 4),
	"percent_base" text[],
	"formula" text,
	"currency_code" text,
	"methods" text[],
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_item_versions_type_check" CHECK ("cost_item_versions"."calc_type" in ('fixed', 'percent', 'per_kg', 'per_cbm', 'formula')),
	CONSTRAINT "cost_item_versions_amount_check" CHECK ("cost_item_versions"."amount" is null or "cost_item_versions"."amount" >= 0),
	CONSTRAINT "cost_item_versions_base_check" CHECK ("cost_item_versions"."percent_base" is null or "cost_item_versions"."percent_base" <@ array['goods', 'shipping']::text[]),
	CONSTRAINT "cost_item_versions_methods_check" CHECK ("cost_item_versions"."methods" is null or "cost_item_versions"."methods" <@ array['air', 'sea', 'land', 'rail']::text[])
);
--> statement-breakpoint
CREATE TABLE "cost_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_fa" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"code" text PRIMARY KEY NOT NULL,
	"name_fa" text NOT NULL,
	"is_base" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currencies_code_check" CHECK ("currencies"."code" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"currency_code" text NOT NULL,
	"kind" text DEFAULT 'market' NOT NULL,
	"rate_toman" numeric(18, 4) NOT NULL,
	"rate_date" date NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_kind_check" CHECK ("exchange_rates"."kind" in ('market', 'customs')),
	CONSTRAINT "exchange_rates_rate_check" CHECK ("exchange_rates"."rate_toman" > 0)
);
--> statement-breakpoint
CREATE TABLE "hs_code_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title_fa" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"duty_type" text NOT NULL,
	"duty_value" numeric(18, 4) NOT NULL,
	"duty_base" text[],
	"duty_currency" text,
	"fixed_per" text,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"import_batch" uuid,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hs_code_versions_type_check" CHECK ("hs_code_versions"."duty_type" in ('percent', 'fixed')),
	CONSTRAINT "hs_code_versions_value_check" CHECK ("hs_code_versions"."duty_value" >= 0),
	CONSTRAINT "hs_code_versions_base_check" CHECK ("hs_code_versions"."duty_base" is null or "hs_code_versions"."duty_base" <@ array['goods', 'shipping', 'costs']::text[]),
	CONSTRAINT "hs_code_versions_per_check" CHECK ("hs_code_versions"."fixed_per" is null or "hs_code_versions"."fixed_per" in ('unit', 'kg', 'shipment'))
);
--> statement-breakpoint
CREATE TABLE "hs_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hs_codes_code_check" CHECK ("hs_codes"."code" ~ '^[0-9]{4,12}$')
);
--> statement-breakpoint
CREATE TABLE "shipping_method_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"method_key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"rate_per_kg" numeric(18, 4),
	"rate_per_cbm" numeric(18, 4),
	"volumetric_factor" numeric(10, 2),
	"min_charge" numeric(18, 4),
	"currency_code" text NOT NULL,
	"transit_min_days" integer,
	"transit_max_days" integer,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_method_versions_values_check" CHECK (("shipping_method_versions"."rate_per_kg" is null or "shipping_method_versions"."rate_per_kg" >= 0) and ("shipping_method_versions"."rate_per_cbm" is null or "shipping_method_versions"."rate_per_cbm" >= 0)
        and ("shipping_method_versions"."volumetric_factor" is null or "shipping_method_versions"."volumetric_factor" > 0) and ("shipping_method_versions"."min_charge" is null or "shipping_method_versions"."min_charge" >= 0)
        and ("shipping_method_versions"."transit_min_days" is null or "shipping_method_versions"."transit_min_days" between 1 and 365)
        and ("shipping_method_versions"."transit_max_days" is null or "shipping_method_versions"."transit_max_days" between 1 and 365)
        and ("shipping_method_versions"."transit_min_days" is null or "shipping_method_versions"."transit_max_days" is null or "shipping_method_versions"."transit_min_days" <= "shipping_method_versions"."transit_max_days"))
);
--> statement-breakpoint
CREATE TABLE "shipping_methods" (
	"key" text PRIMARY KEY NOT NULL,
	"name_fa" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shipping_methods_key_check" CHECK ("shipping_methods"."key" in ('air', 'sea', 'land', 'rail'))
);
--> statement-breakpoint
CREATE TABLE "tax_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"vat_percent" numeric(6, 3) NOT NULL,
	"vat_base" text[] NOT NULL,
	"customs_rate_for" text[] NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_versions_vat_check" CHECK ("tax_versions"."vat_percent" >= 0 and "tax_versions"."vat_percent" <= 100),
	CONSTRAINT "tax_versions_base_check" CHECK ("tax_versions"."vat_base" <@ array['goods', 'shipping', 'costs', 'duty']::text[]),
	CONSTRAINT "tax_versions_customs_check" CHECK ("tax_versions"."customs_rate_for" <@ array['duty', 'vat']::text[])
);
--> statement-breakpoint
ALTER TABLE "cost_item_versions" ADD CONSTRAINT "cost_item_versions_item_id_cost_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."cost_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_item_versions" ADD CONSTRAINT "cost_item_versions_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_item_versions" ADD CONSTRAINT "cost_item_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hs_code_versions" ADD CONSTRAINT "hs_code_versions_code_hs_codes_code_fk" FOREIGN KEY ("code") REFERENCES "public"."hs_codes"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hs_code_versions" ADD CONSTRAINT "hs_code_versions_duty_currency_currencies_code_fk" FOREIGN KEY ("duty_currency") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hs_code_versions" ADD CONSTRAINT "hs_code_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_method_versions" ADD CONSTRAINT "shipping_method_versions_method_key_shipping_methods_key_fk" FOREIGN KEY ("method_key") REFERENCES "public"."shipping_methods"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_method_versions" ADD CONSTRAINT "shipping_method_versions_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_method_versions" ADD CONSTRAINT "shipping_method_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_versions" ADD CONSTRAINT "tax_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_item_versions_item_idx" ON "cost_item_versions" USING btree ("item_id","valid_from");--> statement-breakpoint
CREATE INDEX "exchange_rates_currency_idx" ON "exchange_rates" USING btree ("currency_code","kind","rate_date","created_at");--> statement-breakpoint
CREATE INDEX "hs_code_versions_code_idx" ON "hs_code_versions" USING btree ("code","valid_from");--> statement-breakpoint
CREATE INDEX "shipping_method_versions_method_idx" ON "shipping_method_versions" USING btree ("method_key","valid_from");--> statement-breakpoint
CREATE INDEX "tax_versions_valid_idx" ON "tax_versions" USING btree ("valid_from");