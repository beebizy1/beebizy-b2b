ALTER TABLE "deposits" ADD COLUMN "total_amount_cents" bigint;--> statement-breakpoint
ALTER TABLE "deposits" ADD COLUMN "balance_due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_total_nonnegative_check" CHECK ("deposits"."total_amount_cents" is null or "deposits"."total_amount_cents" >= 0);--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_amount_within_total_check" CHECK ("deposits"."total_amount_cents" is null or "deposits"."amount_cents" <= "deposits"."total_amount_cents");