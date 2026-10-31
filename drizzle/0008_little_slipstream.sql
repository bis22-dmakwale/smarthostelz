CREATE TABLE "booking_settings" (
	"id" text PRIMARY KEY DEFAULT 'current' NOT NULL,
	"academic_year" text NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"monthly_rent" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_booking_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year" text NOT NULL,
	"bank_account_no" text NOT NULL,
	"amount" integer NOT NULL,
	"method" "payment_method" DEFAULT 'Bank' NOT NULL,
	"reference" text NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hostel_booking_payments_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "hostel_booking_payments" ADD CONSTRAINT "hostel_booking_payments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_booking_payments_student_year_idx" ON "hostel_booking_payments" USING btree ("student_id","academic_year");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_applications_student_academic_year_idx" ON "booking_applications" USING btree ("student_id","academic_year") WHERE "booking_applications"."academic_year" IS NOT NULL AND "booking_applications"."status" = 'approved';--> statement-breakpoint
WITH numbered_students AS (
  SELECT "id", row_number() OVER (ORDER BY "id") AS "row_number"
  FROM "users"
  WHERE "role" = 'student' AND "bank_account_no" IS NULL
)
UPDATE "users"
SET "bank_account_no" = 'MUB' || lpad(numbered_students."row_number"::text, 10, '0')
FROM numbered_students
WHERE "users"."id" = numbered_students."id";