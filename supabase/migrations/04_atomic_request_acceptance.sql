-- ============================================================
-- VELTO MIGRATION 04: Atomic Request Acceptance & Trade Creation
-- Milestone 5: Security-critical backend atomic matching
-- ============================================================

-- 1. Standardize column names in public.trades:
-- Ensure fulfiller_id and fulfiller_confirmed are used consistently
DO $$
BEGIN
    -- Rename acceptor_id -> fulfiller_id if exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'acceptor_id'
    ) THEN
        ALTER TABLE public.trades RENAME COLUMN acceptor_id TO fulfiller_id;
    END IF;

    -- Rename acceptor_confirmed -> fulfiller_confirmed if exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'acceptor_confirmed'
    ) THEN
        ALTER TABLE public.trades RENAME COLUMN acceptor_confirmed TO fulfiller_confirmed;
    END IF;

    -- Rename constraint trades_acceptor_id_fkey -> trades_fulfiller_id_fkey if exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'trades_acceptor_id_fkey'
    ) THEN
        ALTER TABLE public.trades RENAME CONSTRAINT trades_acceptor_id_fkey TO trades_fulfiller_id_fkey;
    END IF;
END $$;

-- 2. Add Unique constraint on trades.request_id (One trade per request invariant)
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_request_id_unique;
ALTER TABLE public.trades ADD CONSTRAINT trades_request_id_unique UNIQUE (request_id);

-- 3. Update participant check constraint on trades
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS different_users;
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS different_participants;
ALTER TABLE public.trades ADD CONSTRAINT different_participants CHECK (requester_id <> fulfiller_id);

-- 4. Enable RLS and Configure Policies on public.trades
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Allow authenticated users to create trade" ON public.trades;
DROP POLICY IF EXISTS "Allow trade participants to view trade" ON public.trades;
DROP POLICY IF EXISTS "Allow trade participants to update trade" ON public.trades;
DROP POLICY IF EXISTS "Disallow direct trade insertion" ON public.trades;

-- SELECT policy: Only the requester and fulfiller may view the trade
CREATE POLICY "Allow trade participants to view trade" 
  ON public.trades 
  FOR SELECT 
  TO authenticated 
  USING (auth.uid() = requester_id OR auth.uid() = fulfiller_id);

-- UPDATE policy: Only participants can update confirmation status
CREATE POLICY "Allow trade participants to update trade" 
  ON public.trades 
  FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = requester_id OR auth.uid() = fulfiller_id);

-- INSERT policy: Strictly prevent direct inserts from frontend/client.
-- All trades MUST be created through the SECURITY DEFINER RPC.
CREATE POLICY "Disallow direct trade insertion" 
  ON public.trades 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (false);

-- 5. Tighten UPDATE policy on exchange_requests:
-- Regular users can only update their own requests to CANCELLED or while OPEN;
-- they CANNOT directly set status to 'ACCEPTED' (must go through the RPC).
DROP POLICY IF EXISTS "Allow students to update own request" ON public.exchange_requests;
CREATE POLICY "Allow students to update own request" 
  ON public.exchange_requests 
  FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = requester_id)
  WITH CHECK (status IN ('OPEN', 'CANCELLED'));

-- 6. Atomic Request Acceptance RPC Function
CREATE OR REPLACE FUNCTION public.accept_exchange_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_fulfiller_id UUID;
    v_fulfiller_profile RECORD;
    v_request RECORD;
    v_trade_id UUID;
BEGIN
    -- 1. Identify accepting user from secure auth context
    v_fulfiller_id := auth.uid();
    IF v_fulfiller_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Authentication required to accept request.'
        );
    END IF;

    -- 2. Verify accepting user profile status (must be active student)
    SELECT * INTO v_fulfiller_profile 
    FROM public.profiles 
    WHERE id = v_fulfiller_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Student profile not found. Please complete profile setup.'
        );
    END IF;

    IF v_fulfiller_profile.is_banned = TRUE OR v_fulfiller_profile.is_suspended = TRUE THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Your account is restricted from accepting exchange requests.'
        );
    END IF;

    IF v_fulfiller_profile.is_onboarded = FALSE THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Please complete your student profile before accepting trades.'
        );
    END IF;

    -- 3. Lock the request row exclusively to prevent race conditions
    SELECT * INTO v_request 
    FROM public.exchange_requests 
    WHERE id = p_request_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Exchange request does not exist.'
        );
    END IF;

    -- 4. Validate request status
    IF v_request.status <> 'OPEN' THEN
        IF v_request.status = 'ACCEPTED' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'This request has already been accepted by another student.'
            );
        ELSIF v_request.status = 'CANCELLED' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'This request was cancelled by the requester.'
            );
        ELSIF v_request.status = 'EXPIRED' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'This exchange request has expired.'
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'This exchange request is no longer open.'
            );
        END IF;
    END IF;

    -- 5. Check if request has expired by timestamp
    IF v_request.expires_at <= NOW() THEN
        UPDATE public.exchange_requests 
        SET status = 'EXPIRED', updated_at = NOW() 
        WHERE id = p_request_id;

        RETURN jsonb_build_object(
            'success', false, 
            'error', 'This exchange request has expired.'
        );
    END IF;

    -- 6. Enforce that requester cannot accept their own request
    IF v_request.requester_id = v_fulfiller_id THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'You cannot accept your own exchange request.'
        );
    END IF;

    -- 7. Enforce campus boundary
    IF v_request.campus <> v_fulfiller_profile.campus THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Exchange requests can only be accepted by students from the same campus.'
        );
    END IF;

    -- 8. Verify no trade already exists for this request
    IF EXISTS (SELECT 1 FROM public.trades WHERE request_id = p_request_id) THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'A trade has already been created for this request.'
        );
    END IF;

    -- 9. Atomically update request status to ACCEPTED
    UPDATE public.exchange_requests 
    SET status = 'ACCEPTED', updated_at = NOW() 
    WHERE id = p_request_id;

    -- 10. Atomically create the Trade Room
    INSERT INTO public.trades (
        request_id,
        requester_id,
        fulfiller_id,
        amount,
        request_type,
        status,
        meetup_location,
        requester_confirmed,
        fulfiller_confirmed,
        started_at
    ) VALUES (
        v_request.id,
        v_request.requester_id,
        v_fulfiller_id,
        v_request.amount,
        v_request.request_type,
        'IN_PROGRESS',
        v_request.location_hint,
        FALSE,
        FALSE,
        NOW()
    ) RETURNING id INTO v_trade_id;

    -- 11. Return successful response with new trade ID
    RETURN jsonb_build_object(
        'success', true,
        'trade_id', v_trade_id,
        'message', 'Request successfully accepted! Trade created.'
    );
END;
$$;

-- 7. Restrict function execution permissions
REVOKE ALL ON FUNCTION public.accept_exchange_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_exchange_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_exchange_request(UUID) TO authenticated;

-- 8. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
