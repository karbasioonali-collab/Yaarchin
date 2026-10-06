CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"product_id" uuid,
	"product_title" text,
	"qty" integer,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquiries_status_check" CHECK ("inquiries"."status" in ('open', 'done', 'cancelled')),
	CONSTRAINT "inquiries_qty_check" CHECK ("inquiries"."qty" is null or "inquiries"."qty" > 0),
	CONSTRAINT "inquiries_product_check" CHECK ("inquiries"."product_id" is not null or "inquiries"."product_title" is not null)
);
--> statement-breakpoint
CREATE TABLE "inquiry_supplier_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"inquiry_supplier_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"correspondence_id" bigint,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquiry_supplier_events_status_check" CHECK ("inquiry_supplier_events"."status" in ('pending', 'contacted', 'replied', 'quoted', 'declined'))
);
--> statement-breakpoint
CREATE TABLE "inquiry_suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"listing_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquiry_suppliers_status_check" CHECK ("inquiry_suppliers"."status" in ('pending', 'contacted', 'replied', 'quoted', 'declined'))
);
--> statement-breakpoint
CREATE TABLE "sms_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"to_mobile" text NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"provider" text,
	"error" text,
	"conversation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_outbox_status_check" CHECK ("sms_outbox"."status" in ('test', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "staff_notification_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"sms_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_supplier_events" ADD CONSTRAINT "inquiry_supplier_events_inquiry_supplier_id_inquiry_suppliers_id_fk" FOREIGN KEY ("inquiry_supplier_id") REFERENCES "public"."inquiry_suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_supplier_events" ADD CONSTRAINT "inquiry_supplier_events_correspondence_id_company_correspondence_id_fk" FOREIGN KEY ("correspondence_id") REFERENCES "public"."company_correspondence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_supplier_events" ADD CONSTRAINT "inquiry_supplier_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_suppliers" ADD CONSTRAINT "inquiry_suppliers_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_suppliers" ADD CONSTRAINT "inquiry_suppliers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_suppliers" ADD CONSTRAINT "inquiry_suppliers_listing_id_product_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."product_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_suppliers" ADD CONSTRAINT "inquiry_suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_outbox" ADD CONSTRAINT "sms_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_outbox" ADD CONSTRAINT "sms_outbox_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_notification_prefs" ADD CONSTRAINT "staff_notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiries_conversation_idx" ON "inquiries" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "inquiries_status_idx" ON "inquiries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "inquiry_supplier_events_supplier_idx" ON "inquiry_supplier_events" USING btree ("inquiry_supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "inquiry_supplier_events_by_idx" ON "inquiry_supplier_events" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inquiry_suppliers_uq" ON "inquiry_suppliers" USING btree ("inquiry_id","company_id");--> statement-breakpoint
CREATE INDEX "inquiry_suppliers_company_idx" ON "inquiry_suppliers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "sms_outbox_created_idx" ON "sms_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sms_outbox_conversation_idx" ON "sms_outbox" USING btree ("conversation_id","user_id","created_at");