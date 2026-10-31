DROP INDEX "hostel_booking_payments_student_year_idx";--> statement-breakpoint
ALTER TABLE "hostel_booking_payments" ADD COLUMN "payment_month" text;--> statement-breakpoint
UPDATE "hostel_booking_payments" SET "payment_month" = to_char("paid_at", 'YYYY-MM') WHERE "payment_month" IS NULL;--> statement-breakpoint
ALTER TABLE "hostel_booking_payments" ALTER COLUMN "payment_month" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_booking_payments_student_month_idx" ON "hostel_booking_payments" USING btree ("student_id","academic_year","payment_month");