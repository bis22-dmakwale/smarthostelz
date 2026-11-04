ALTER TYPE "public"."payment_method" ADD VALUE 'PayChangu';--> statement-breakpoint
CREATE TABLE "paychangu_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year" text NOT NULL,
	"payment_month" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'MWK' NOT NULL,
	"tx_ref" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"checkout_url" text,
	"provider_reference" text,
	"channel" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "paychangu_payments_tx_ref_unique" UNIQUE("tx_ref")
);
--> statement-breakpoint
ALTER TABLE "paychangu_payments" ADD CONSTRAINT "paychangu_payments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paychangu_payments_one_success_idx" ON "paychangu_payments" USING btree ("student_id","academic_year","payment_month") WHERE "paychangu_payments"."status" = 'success';