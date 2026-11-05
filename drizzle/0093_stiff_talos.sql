ALTER TABLE "vendor_payment_plans" ALTER COLUMN "balance_due_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_payment_plans" ADD COLUMN "last_paid_by" text;--> statement-breakpoint
ALTER TABLE "vendor_payment_plans" ADD COLUMN "final_status" text DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_payment_plans" ADD COLUMN "final_paid_at" timestamp with time zone;