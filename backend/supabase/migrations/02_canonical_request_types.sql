-- ============================================================
-- VELTO MIGRATION 02: Canonical Request Types
-- Forward-only migration to align database with canonical types:
--   - 'NEED_CASH' (Requester needs physical cash, pays via UPI)
--   - 'HAVE_CASH_WANT_UPI' (Requester has physical cash, wants UPI)
--
-- Legacy values mapped:
--   - 'need_cash' -> 'NEED_CASH'
--   - 'have_cash' -> 'HAVE_CASH_WANT_UPI'
-- ============================================================

-- 1. Safely add canonical values to legacy enum if still referenced
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_type') THEN
        BEGIN
            ALTER TYPE trade_type ADD VALUE IF NOT EXISTS 'NEED_CASH';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        BEGIN
            ALTER TYPE trade_type ADD VALUE IF NOT EXISTS 'HAVE_CASH_WANT_UPI';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

-- 2. Convert exchange_requests.request_type to TEXT with canonical mapping
ALTER TABLE public.exchange_requests 
  ALTER COLUMN request_type TYPE TEXT 
  USING (
    CASE 
      WHEN request_type::text = 'need_cash' THEN 'NEED_CASH'
      WHEN request_type::text = 'have_cash' THEN 'HAVE_CASH_WANT_UPI'
      ELSE request_type::text
    END
  );

-- 3. Convert trades.request_type to TEXT with canonical mapping
ALTER TABLE public.trades 
  ALTER COLUMN request_type TYPE TEXT 
  USING (
    CASE 
      WHEN request_type::text = 'need_cash' THEN 'NEED_CASH'
      WHEN request_type::text = 'have_cash' THEN 'HAVE_CASH_WANT_UPI'
      ELSE request_type::text
    END
  );

-- 4. Add strict database-level CHECK constraints to guarantee canonical values only
ALTER TABLE public.exchange_requests DROP CONSTRAINT IF EXISTS exchange_requests_request_type_check;
ALTER TABLE public.exchange_requests ADD CONSTRAINT exchange_requests_request_type_check 
  CHECK (request_type IN ('NEED_CASH', 'HAVE_CASH_WANT_UPI'));

ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_request_type_check;
ALTER TABLE public.trades ADD CONSTRAINT trades_request_type_check 
  CHECK (request_type IN ('NEED_CASH', 'HAVE_CASH_WANT_UPI'));

-- 5. Ensure amount constraints are strictly enforced at ₹20–₹500
ALTER TABLE public.exchange_requests DROP CONSTRAINT IF EXISTS exchange_requests_amount_check;
ALTER TABLE public.exchange_requests ADD CONSTRAINT exchange_requests_amount_check 
  CHECK (amount >= 20.00 AND amount <= 500.00);

ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_amount_check;
ALTER TABLE public.trades ADD CONSTRAINT trades_amount_check 
  CHECK (amount >= 20.00 AND amount <= 500.00);

-- 6. Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
