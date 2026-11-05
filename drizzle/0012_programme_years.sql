ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "programme_years" integer;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_programme_years_check') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_programme_years_check" CHECK ("programme_years" IS NULL OR "programme_years" IN (4, 5));
  END IF;
END $$;
