-- ============================================================
-- VELTO MIGRATION 09: Final Security Hardening & Concurrency Protection
-- Milestone 10: Trigger reputation authorization & internal RPC bypass
-- ============================================================

-- 1. Hardened Trigger Function: protect_profile_privileges
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- 1. Security & Disciplinary Flags (is_admin, is_banned, is_suspended):
    -- Strictest enforcement: ONLY verified administrators can modify these.
    IF (OLD.is_admin IS DISTINCT FROM NEW.is_admin 
        OR OLD.is_banned IS DISTINCT FROM NEW.is_banned 
        OR OLD.is_suspended IS DISTINCT FROM NEW.is_suspended) THEN
        
        IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
            RAISE EXCEPTION 'Unauthorized: Only campus administrators can modify security or moderation attributes.';
        END IF;
    END IF;

    -- 2. Reputation Metrics (rating_avg, total_ratings, total_trades):
    -- Clients cannot directly modify reputation; only internal system RPCs or admins can.
    IF (OLD.rating_avg IS DISTINCT FROM NEW.rating_avg
        OR OLD.total_ratings IS DISTINCT FROM NEW.total_ratings
        OR OLD.total_trades IS DISTINCT FROM NEW.total_trades) THEN
        
        IF auth.uid() IS NOT NULL 
           AND NOT public.is_admin(auth.uid()) 
           AND current_setting('velto.internal_reputation_update', true) IS DISTINCT FROM 'true' THEN
            RAISE EXCEPTION 'Unauthorized: Reputation numbers cannot be directly updated by clients.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_privileges();

-- 2. Update confirm_trade_settlement to set internal_reputation_update flag
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
    -- 1. Authenticate caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Authentication required to confirm trade settlement.'
        );
    END IF;

    -- 2. Verify account is not suspended or banned
    SELECT * INTO v_caller_profile 
    FROM public.profiles 
    WHERE id = v_caller_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Student profile not found.'
        );
    END IF;

    IF v_caller_profile.is_banned = TRUE OR v_caller_profile.is_suspended = TRUE THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Your account is restricted from confirming trade settlements.'
        );
    END IF;

    -- 3. Lock trade record exclusively
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

    -- 4. Verify trade is currently IN_PROGRESS
    IF v_trade.status <> 'IN_PROGRESS' THEN
        IF v_trade.status = 'COMPLETED' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'This trade is already fully COMPLETED.'
            );
        ELSIF v_trade.status = 'CANCELLED' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'This trade room has been cancelled.'
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'This trade is not active for settlement.'
            );
        END IF;
    END IF;

    -- 5. Determine participant role
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
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Access denied: You are not a participant in this trade.'
        );
    END IF;

    -- 6. Evaluate if both parties have confirmed
    IF v_new_requester_confirmed = TRUE AND v_new_fulfiller_confirmed = TRUE THEN
        v_new_status := 'COMPLETED';
        v_new_completed_at := NOW();

        UPDATE public.trades 
        SET 
            requester_confirmed = v_new_requester_confirmed,
            fulfiller_confirmed = v_new_fulfiller_confirmed,
            status = v_new_status,
            completed_at = v_new_completed_at
        WHERE id = p_trade_id;

        UPDATE public.exchange_requests 
        SET status = 'COMPLETED', updated_at = NOW() 
        WHERE id = v_trade.request_id;

        -- Authorize internal reputation update for this transaction
        PERFORM set_config('velto.internal_reputation_update', 'true', true);

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
            'message', 'Confirmation recorded. Awaiting your trade partner.'
        );
    END IF;
END;
$$;

-- 3. Update submit_trade_rating to set internal_reputation_update flag
CREATE OR REPLACE FUNCTION public.submit_trade_rating(
    p_trade_id UUID,
    p_rating INTEGER,
    p_comment TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_reviewer_id UUID;
    v_reviewed_id UUID;
    v_trade RECORD;
    v_trimmed_comment TEXT;
    v_rating_id UUID;
    v_avg_score NUMERIC(3, 2);
    v_rating_count INTEGER;
BEGIN
    v_reviewer_id := auth.uid();
    IF v_reviewer_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Authentication required to submit rating.'
        );
    END IF;

    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Rating must be an integer between 1 and 5 stars.'
        );
    END IF;

    v_trimmed_comment := NULLIF(TRIM(p_comment), '');
    IF v_trimmed_comment IS NOT NULL AND char_length(v_trimmed_comment) > 500 THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Feedback comment cannot exceed 500 characters.'
        );
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = v_reviewer_id AND (is_banned = TRUE OR is_suspended = TRUE)
    ) THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Your account is restricted from submitting ratings.'
        );
    END IF;

    SELECT * INTO v_trade 
    FROM public.trades 
    WHERE id = p_trade_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Trade room does not exist.'
        );
    END IF;

    IF v_trade.status <> 'COMPLETED' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Ratings can only be submitted after a trade is fully COMPLETED.'
        );
    END IF;

    IF v_reviewer_id = v_trade.requester_id THEN
        v_reviewed_id := v_trade.fulfiller_id;
    ELSIF v_reviewer_id = v_trade.fulfiller_id THEN
        v_reviewed_id := v_trade.requester_id;
    ELSE
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Access denied: You are not a participant in this trade.'
        );
    END IF;

    IF v_reviewer_id = v_reviewed_id THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'You cannot rate yourself.'
        );
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.trade_ratings 
        WHERE trade_id = p_trade_id AND reviewer_id = v_reviewer_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'You have already submitted a rating for this trade partner.'
        );
    END IF;

    INSERT INTO public.trade_ratings (
        trade_id,
        reviewer_id,
        reviewed_id,
        rating,
        comment,
        created_at
    ) VALUES (
        p_trade_id,
        v_reviewer_id,
        v_reviewed_id,
        p_rating,
        v_trimmed_comment,
        NOW()
    ) RETURNING id INTO v_rating_id;

    -- Recalculate partner's reputation metrics
    SELECT 
        ROUND(AVG(rating)::numeric, 2), 
        COUNT(*)::INTEGER 
    INTO v_avg_score, v_rating_count 
    FROM public.trade_ratings 
    WHERE reviewed_id = v_reviewed_id;

    -- Authorize internal reputation update for this transaction
    PERFORM set_config('velto.internal_reputation_update', 'true', true);

    UPDATE public.profiles 
    SET 
        rating_avg = COALESCE(v_avg_score, 5.00),
        total_ratings = COALESCE(v_rating_count, 0),
        updated_at = NOW() 
    WHERE id = v_reviewed_id;

    RETURN jsonb_build_object(
        'success', true,
        'rating_id', v_rating_id,
        'rating', p_rating,
        'comment', v_trimmed_comment,
        'message', 'Rating submitted! Thank you for strengthening campus trust.'
    );
END;
$$;

-- 4. Secure function: get_trade_partner_upi
-- Strictly reveals partner UPI ID only to the two verified participants of the trade
CREATE OR REPLACE FUNCTION public.get_trade_partner_upi(p_trade_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_requester UUID;
    v_fulfiller UUID;
    v_partner_id UUID;
    v_upi TEXT;
BEGIN
    SELECT requester_id, fulfiller_id 
    INTO v_requester, v_fulfiller
    FROM public.trades
    WHERE id = p_trade_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trade not found';
    END IF;

    IF auth.uid() <> v_requester AND auth.uid() <> v_fulfiller THEN
        RAISE EXCEPTION 'Unauthorized: Only trade participants can access UPI details.';
    END IF;

    IF auth.uid() = v_requester THEN
        v_partner_id := v_fulfiller;
    ELSE
        v_partner_id := v_requester;
    END IF;

    SELECT upi_id INTO v_upi
    FROM public.profiles
    WHERE id = v_partner_id;

    RETURN v_upi;
END;
$$;

REVOKE ALL ON FUNCTION public.get_trade_partner_upi(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trade_partner_upi(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_trade_partner_upi(UUID) TO authenticated;

-- 5. Reload postgREST schema cache
NOTIFY pgrst, 'reload schema';
