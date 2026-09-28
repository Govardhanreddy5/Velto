-- ============================================================
-- VELTO MIGRATION 14: Shared Two-College Community & Realtime Hardening
-- Unifies Vishnu (@vishnu.edu.in) and SVECW (@svecw.edu.in) into ONE shared exchange
-- ============================================================

-- 1. Ensure Full Replica Identity on all Realtime Tables
ALTER TABLE public.exchange_requests REPLICA IDENTITY FULL;
ALTER TABLE public.trades REPLICA IDENTITY FULL;
ALTER TABLE public.trade_messages REPLICA IDENTITY FULL;

-- Ensure all tables are part of supabase_realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'exchange_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.exchange_requests;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'trades'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'trade_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_messages;
    END IF;
END $$;

-- 2. Validate and Harden Campus Names
-- Approved campuses:
-- - 'Vishnu Educational Society' (derived from @vishnu.edu.in)
-- - 'Shri Vishnu Engineering College for Women (SVECW)' (derived from @svecw.edu.in)

CREATE OR REPLACE FUNCTION public.is_approved_campus(p_campus TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT p_campus IN (
        'Vishnu Educational Society',
        'Shri Vishnu Engineering College for Women (SVECW)'
    );
$$;

-- 3. Update RLS Policies on exchange_requests for Shared Community
-- Both Vishnu and SVECW verified, non-banned, non-suspended students can view all open requests.
-- Unauthenticated users cannot read anything.
DROP POLICY IF EXISTS "Allow authenticated users to read exchange requests" ON public.exchange_requests;
DROP POLICY IF EXISTS "requests_select_feed_or_own" ON public.exchange_requests;

CREATE POLICY "requests_select_feed_or_own"
    ON public.exchange_requests FOR SELECT
    TO authenticated
    USING (
        (
            status = 'OPEN' 
            AND expires_at > NOW()
            AND public.is_approved_campus(campus)
            AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND public.is_approved_campus(p.campus)
                  AND p.is_banned = FALSE
                  AND p.is_suspended = FALSE
            )
        )
        OR requester_id = auth.uid()
        OR public.is_admin(auth.uid())
    );

-- Requests can only be created by verified, non-banned students for their own approved campus
DROP POLICY IF EXISTS "requests_insert_own" ON public.exchange_requests;
CREATE POLICY "requests_insert_own"
    ON public.exchange_requests FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = requester_id
        AND public.is_approved_campus(campus)
        AND campus = (SELECT p.campus FROM public.profiles p WHERE p.id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_banned = FALSE
              AND p.is_suspended = FALSE
        )
    );

-- 4. Update Atomic Request Acceptance RPC (accept_exchange_request)
-- Allow cross-college acceptance between Vishnu and SVECW while strictly enforcing:
-- - Both participants belong to approved campuses
-- - Not self-acceptance (requester <> fulfiller)
-- - Fulfiller is onboarded and not banned or suspended
-- - Request is OPEN and unexpired
-- - Atomic row locking (FOR UPDATE)
-- - Unique trade creation per request
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

    -- 2. Verify accepting user profile status (must be active, onboarded student from approved campus)
    SELECT * INTO v_fulfiller_profile 
    FROM public.profiles 
    WHERE id = v_fulfiller_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Student profile not found. Please complete profile setup.'
        );
    END IF;

    IF NOT public.is_approved_campus(v_fulfiller_profile.campus) THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Accepting student belongs to an unapproved campus.'
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

    -- 4. Validate request campus is approved
    IF NOT public.is_approved_campus(v_request.campus) THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'This request belongs to an unapproved campus.'
        );
    END IF;

    -- 5. Validate request status
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

    -- 6. Check if request has expired by timestamp
    IF v_request.expires_at <= NOW() THEN
        UPDATE public.exchange_requests 
        SET status = 'EXPIRED', updated_at = NOW() 
        WHERE id = p_request_id;

        RETURN jsonb_build_object(
            'success', false, 
            'error', 'This exchange request has expired.'
        );
    END IF;

    -- 7. Enforce that requester cannot accept their own request
    IF v_request.requester_id = v_fulfiller_id THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'You cannot accept your own exchange request.'
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

REVOKE ALL ON FUNCTION public.accept_exchange_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_exchange_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_exchange_request(UUID) TO authenticated;

-- 5. Notify PostgREST schema cache
NOTIFY pgrst, 'reload schema';
