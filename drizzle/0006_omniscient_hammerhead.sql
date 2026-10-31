ALTER TABLE "booking_applications" ADD COLUMN "booking_month" integer;--> statement-breakpoint
ALTER TABLE "booking_applications" ADD COLUMN "academic_year" text;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_applications_student_period_idx" ON "booking_applications" USING btree ("student_id","booking_month","academic_year");