ALTER TABLE "vendors" ADD COLUMN "portal_token" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_portal_token_unique" UNIQUE("portal_token");