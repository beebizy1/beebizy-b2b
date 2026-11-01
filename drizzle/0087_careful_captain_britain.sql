ALTER TABLE "event_vendors" ADD COLUMN "paperwork_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "contract_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "contract_status" text DEFAULT 'not-required' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "contract_file_url" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "contract_file_name" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "signed_contract_url" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "signed_contract_name" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "signed_contract_uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "coi_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "coi_status" text DEFAULT 'not-required' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "coi_file_url" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "coi_file_name" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "coi_uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "coi_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "coi_coverage_cents" bigint;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "minimum_coverage_cents" bigint;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "additional_insured" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "paperwork_instructions" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "paperwork_public_token" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "paperwork_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "paperwork_delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "paperwork_delivery_error" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "paperwork_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "paperwork_reviewed_by" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD CONSTRAINT "event_vendors_paperwork_public_token_unique" UNIQUE("paperwork_public_token");