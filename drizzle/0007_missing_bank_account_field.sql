ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bank_account_no" text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'users_bank_account_no_unique'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_bank_account_no_unique" UNIQUE ("bank_account_no");
  END IF;
END $$;
