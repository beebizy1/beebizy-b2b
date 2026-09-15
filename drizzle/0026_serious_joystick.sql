ALTER TABLE "volunteer_shifts" ADD COLUMN "need_id" text;--> statement-breakpoint
ALTER TABLE "volunteer_shifts" ADD CONSTRAINT "volunteer_shifts_need_id_volunteer_needs_id_fk" FOREIGN KEY ("need_id") REFERENCES "public"."volunteer_needs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "volunteer_shifts_need_idx" ON "volunteer_shifts" USING btree ("need_id");