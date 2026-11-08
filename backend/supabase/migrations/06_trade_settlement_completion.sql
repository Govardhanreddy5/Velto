-- ============================================================
-- VELTO MIGRATION 06: Two-Sided Trade Settlement & Secure Completion
-- Milestone 7: Atomic two-sided confirmation and completion
-- ============================================================

-- 1. Ensure trades table has full replica identity for realtime subscription
ALTER TABLE public.trades REPLICA IDENTITY FULL;

-- Ensure trades table is in supabase_realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'trades'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
    END IF;
END $$;

-- 2. Lock down direct UPDATE on public.trades
-- All settlement confirmations and completion transitions MUST execute via the RPC.
DROP POLICY IF EXISTS "Allow trade participants to update trade" ON public.trades;
DROP POLICY IF EXISTS "Disallow direct trade updates" ON public.trades;

CREATE POLICY "Disallow direct trade updates" 
  ON public.trades 
  FOR UPDATE 
  TO authenticated 
  USING (false);

-- 3. PostgreSQL RPC: confirm_trade_settlement
CREATE OR REPLACE FUNCTION public.confirm_trade_settlement(p_trade_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_profile RECORD;
    v_trade RECORD;
    v_new_requester_confirmed BOOLEAN;
    v_new_fulfiller_confirmed BOOLEAN;
    v_new_status TEXT;
    v_new_completed_at TIMESTAMPTZ;
BEGIN
    -- 1. Identify confirming user securely from auth context
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Authentication required to confirm trade settlement.'
        );
    END IF;

    -- 2. Verify confirming user status (cannot be banned or suspended)
    SELECT * INTO v_caller_profile 
    FROM public.profiles 
    WHERE id = v_caller_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'User profile not found.'
        );
    END IF;

    IF v_caller_profile.is_banned = TRUE OR v_caller_profile.is_suspended = TRUE THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Your account is restricted from performing trade settlement.'
        );
    END IF;

    -- 3. Exclusively lock the trade row to prevent race conditions
    SELECT * INTO v_trade 
    FROM public.trades 
    WHERE id = p_trade_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Trade room does not exist.'
        );
    END IF;

    -- 4. Validate trade status is IN_PROGRESS
    IF v_trade.status <> 'IN_PROGRESS' THEN
        IF v_trade.status = 'COMPLETED' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'This trade has already been completed.'
            );
        ELSIF v_trade.status = 'CANCELLED' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'This trade was cancelled and cannot be confirmed.'
            );
        ELSIF v_trade.status = 'DISPUTED' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'This trade is disputed and under safety review.'
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'This trade is no longer active.'
            );
        END IF;
    END IF;

    -- 5. Determine caller role and enforce single confirmation per participant
    v_new_requester_confirmed := v_trade.requester_confirmed;
    v_new_fulfiller_confirmed := v_trade.fulfiller_confirmed;

    IF v_caller_id = v_trade.requester_id THEN
        IF v_trade.requester_confirmed = TRUE THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'You have already confirmed receipt for this trade.'
            );
        END IF;
        v_new_requester_confirmed := TRUE;

    ELSIF v_caller_id = v_trade.fulfiller_id THEN
        IF v_trade.fulfiller_confirmed = TRUE THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'You have already confirmed receipt for this trade.'
            );
        END IF;
        v_new_fulfiller_confirmed := TRUE;

    ELSE
        -- Outsider attempt
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Access denied: You are not a participant in this trade.'
        );
    END IF;

    -- 6. Evaluate if both parties have confirmed
    IF v_new_requester_confirmed = TRUE AND v_new_fulfiller_confirmed = TRUE THEN
        v_new_status := 'COMPLETED';
        v_new_completed_at := NOW();

        -- Update trades table to COMPLETED
        UPDATE public.trades 
        SET 
            requester_confirmed = v_new_requester_confirmed,
            fulfiller_confirmed = v_new_fulfiller_confirmed,
            status = v_new_status,
            completed_at = v_new_completed_at
        WHERE id = p_trade_id;

        -- Update corresponding exchange_requests status to COMPLETED
        UPDATE public.exchange_requests 
        SET status = 'COMPLETED', updated_at = NOW() 
        WHERE id = v_trade.request_id;

        -- Increment total_trades for both participants
        UPDATE public.profiles 
        SET total_trades = total_trades + 1, updated_at = NOW() 
        WHERE id IN (v_trade.requester_id, v_trade.fulfiller_id);

        RETURN jsonb_build_object(
            'success', true,
            'trade_id', p_trade_id,
            'status', v_new_status,
            'completed', true,
            'requester_confirmed', v_new_requester_confirmed,
            'fulfiller_confirmed', v_new_fulfiller_confirmed,
            'message', 'Trade completed! Both participants confirmed receipt.'
        );
    ELSE
        -- First confirmation: keep IN_PROGRESS
        v_new_status := 'IN_PROGRESS';

        UPDATE public.trades 
        SET 
            requester_confirmed = v_new_requester_confirmed,
            fulfiller_confirmed = v_new_fulfiller_confirmed
        WHERE id = p_trade_id;

        RETURN jsonb_build_object(
            'success', true,
            'trade_id', p_trade_id,
            'status', v_new_status,
            'completed', false,
            'requester_confirmed', v_new_requester_confirmed,
            'fulfiller_confirmed', v_new_fulfiller_confirmed,
            'message', 'Receipt confirmed! Waiting for partner to confirm.'
        );
    END IF;
END;
$$;

-- 4. Permissions
REVOKE ALL ON FUNCTION public.confirm_trade_settlement(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_trade_settlement(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_trade_settlement(UUID) TO authenticated;

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
