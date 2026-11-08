-- ============================================================
-- VELTO MIGRATION 03: Canonical Status Types Alignment
-- Forward-only migration to align exchange_requests and trades
-- status columns with application canonical uppercase types:
--   - exchange_requests.status: 'OPEN', 'ACCEPTED', 'COMPLETED', 'EXPIRED', 'CANCELLED'
--   - trades.status: 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED'
--
-- Fixes error: "invalid input value for enum request_status: 'OPEN'"
-- ============================================================

-- 1. Safely add uppercase values to legacy enums if they exist in Postgres
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_status') THEN
        BEGIN ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'OPEN'; EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'ACCEPTED'; EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'COMPLETED'; EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'EXPIRED'; EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'CANCELLED'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_status') THEN
        BEGIN ALTER TYPE trade_status ADD VALUE IF NOT EXISTS 'IN_PROGRESS'; EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE trade_status ADD VALUE IF NOT EXISTS 'COMPLETED'; EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE trade_status ADD VALUE IF NOT EXISTS 'CANCELLED'; EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE trade_status ADD VALUE IF NOT EXISTS 'DISPUTED'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
END $$;

-- 2. Convert exchange_requests.status to TEXT with canonical uppercase values
ALTER TABLE public.exchange_requests ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.exchange_requests 
  ALTER COLUMN status TYPE TEXT 
  USING (
    CASE 
      WHEN status::text ILIKE 'open' THEN 'OPEN'
      WHEN status::text ILIKE 'accepted' THEN 'ACCEPTED'
      WHEN status::text ILIKE 'matched' THEN 'ACCEPTED'
      WHEN status::text ILIKE 'completed' THEN 'COMPLETED'
      WHEN status::text ILIKE 'cancelled' THEN 'CANCELLED'
      WHEN status::text ILIKE 'expired' THEN 'EXPIRED'
      ELSE UPPER(status::text)
    END
  );

ALTER TABLE public.exchange_requests 
  ALTER COLUMN status SET DEFAULT 'OPEN';

ALTER TABLE public.exchange_requests 
  DROP CONSTRAINT IF EXISTS exchange_requests_status_check;

ALTER TABLE public.exchange_requests 
  ADD CONSTRAINT exchange_requests_status_check 
  CHECK (status IN ('OPEN', 'ACCEPTED', 'COMPLETED', 'EXPIRED', 'CANCELLED'));

-- 3. Convert trades.status to TEXT with canonical uppercase values
ALTER TABLE public.trades ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.trades 
  ALTER COLUMN status TYPE TEXT 
  USING (
    CASE 
      WHEN status::text ILIKE 'in_progress' THEN 'IN_PROGRESS'
      WHEN status::text ILIKE 'completed' THEN 'COMPLETED'
      WHEN status::text ILIKE 'cancelled' THEN 'CANCELLED'
      WHEN status::text ILIKE 'disputed' THEN 'DISPUTED'
      ELSE UPPER(status::text)
    END
  );

ALTER TABLE public.trades 
  ALTER COLUMN status SET DEFAULT 'IN_PROGRESS';

ALTER TABLE public.trades 
  DROP CONSTRAINT IF EXISTS trades_status_check;

ALTER TABLE public.trades 
  ADD CONSTRAINT trades_status_check 
  CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED'));

-- 4. Also ensure request_type columns are canonical TEXT (in case migration 02 was not run)
ALTER TABLE public.exchange_requests 
  ALTER COLUMN request_type TYPE TEXT 
  USING (
    CASE 
      WHEN request_type::text ILIKE 'need_cash' THEN 'NEED_CASH'
      WHEN request_type::text ILIKE 'have_cash' THEN 'HAVE_CASH_WANT_UPI'
      ELSE request_type::text
    END
  );

ALTER TABLE public.trades 
  ALTER COLUMN request_type TYPE TEXT 
  USING (
    CASE 
      WHEN request_type::text ILIKE 'need_cash' THEN 'NEED_CASH'
      WHEN request_type::text ILIKE 'have_cash' THEN 'HAVE_CASH_WANT_UPI'
      ELSE request_type::text
    END
  );

ALTER TABLE public.exchange_requests DROP CONSTRAINT IF EXISTS exchange_requests_request_type_check;
ALTER TABLE public.exchange_requests ADD CONSTRAINT exchange_requests_request_type_check 
  CHECK (request_type IN ('NEED_CASH', 'HAVE_CASH_WANT_UPI'));

ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_request_type_check;
ALTER TABLE public.trades ADD CONSTRAINT trades_request_type_check 
  CHECK (request_type IN ('NEED_CASH', 'HAVE_CASH_WANT_UPI'));

-- 5. Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
