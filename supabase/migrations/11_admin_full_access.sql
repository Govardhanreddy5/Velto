-- ============================================================
-- VELTO MIGRATION 11: Full Administrative Authority & Control
-- Grants designated platform administrator full read and moderation access
-- ============================================================

-- 1. Ensure public.is_admin includes explicit email check for govardhan0477@gmail.com
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = user_id AND (is_admin = TRUE OR email = 'govardhan0477@gmail.com')
    );
END;
$$;

-- 2. Allow Admins to view all trades across campus
DROP POLICY IF EXISTS "Allow trade participants to view trade" ON public.trades;
CREATE POLICY "Allow trade participants and admins to view trade"
    ON public.trades FOR SELECT
    TO authenticated
    USING (
        (auth.uid() = requester_id) OR 
        (auth.uid() = fulfiller_id) OR 
        public.is_admin(auth.uid())
    );

-- 3. Allow Admins to update trades (e.g. force cancellation / dispute resolution)
DROP POLICY IF EXISTS "Admins can moderate trades" ON public.trades;
CREATE POLICY "Admins can moderate trades"
    ON public.trades FOR UPDATE
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- 4. Allow Admins to cancel/update any exchange requests (remove fraudulent or spam posts)
DROP POLICY IF EXISTS "Allow students to update own request" ON public.exchange_requests;
CREATE POLICY "Allow students and admins to update request"
    ON public.exchange_requests FOR UPDATE
    TO authenticated
    USING (
        (auth.uid() = requester_id) OR 
        public.is_admin(auth.uid())
    )
    WITH CHECK (
        (auth.uid() = requester_id) OR 
        public.is_admin(auth.uid())
    );

-- 5. Allow Admins to delete exchange requests if needed
DROP POLICY IF EXISTS "Allow admins to delete requests" ON public.exchange_requests;
CREATE POLICY "Allow admins to delete requests"
    ON public.exchange_requests FOR DELETE
    TO authenticated
    USING (public.is_admin(auth.uid()));

-- 6. RPC: Admin force-cancel exchange request
CREATE OR REPLACE FUNCTION public.admin_cancel_request(
    p_request_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_req RECORD;
BEGIN
    v_admin_id := auth.uid();
    IF NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Admin privileges required.');
    END IF;

    SELECT * INTO v_req FROM public.exchange_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found.');
    END IF;

    UPDATE public.exchange_requests
    SET status = 'CANCELLED',
        note = COALESCE(note, '') || ' [Cancelled by Administrator: ' || p_reason || ']',
        updated_at = NOW()
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Request successfully cancelled by administrator.');
END;
$$;

-- 7. RPC: Admin force-cancel or force-complete trade
CREATE OR REPLACE FUNCTION public.admin_resolve_trade(
    p_trade_id UUID,
    p_action TEXT,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_trade RECORD;
BEGIN
    v_admin_id := auth.uid();
    IF NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Admin privileges required.');
    END IF;

    SELECT * INTO v_trade FROM public.trades WHERE id = p_trade_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trade not found.');
    END IF;

    IF p_action = 'CANCEL' THEN
        UPDATE public.trades
        SET status = 'CANCELLED',
            cancelled_at = NOW()
        WHERE id = p_trade_id;

        UPDATE public.exchange_requests
        SET status = 'CANCELLED',
            updated_at = NOW()
        WHERE id = v_trade.request_id;

    ELSIF p_action = 'COMPLETE' THEN
        UPDATE public.trades
        SET status = 'COMPLETED',
            requester_confirmed = TRUE,
            fulfiller_confirmed = TRUE,
            completed_at = NOW()
        WHERE id = p_trade_id;

        UPDATE public.exchange_requests
        SET status = 'COMPLETED',
            updated_at = NOW()
        WHERE id = v_trade.request_id;

        -- Update completed trades statistics for both students
        UPDATE public.profiles
        SET total_trades = total_trades + 1
        WHERE id IN (v_trade.requester_id, v_trade.fulfiller_id);
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be CANCEL or COMPLETE.');
    END IF;

    -- Log to moderation audit logs
    INSERT INTO public.moderation_audit_logs (
        admin_id,
        target_user_id,
        action,
        reason,
        created_at
    )
    VALUES (
        v_admin_id,
        v_trade.requester_id,
        'UPDATE_REPORT_STATUS',
        'Admin resolved trade #' || SUBSTRING(p_trade_id::text, 1, 8) || ' to ' || p_action || '. Notes: ' || p_notes,
        NOW()
    );

    RETURN jsonb_build_object('success', true, 'message', 'Trade status successfully resolved to ' || p_action || '.');
END;
$$;
