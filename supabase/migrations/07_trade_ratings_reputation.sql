-- ============================================================
-- VELTO MIGRATION 07: Trade Ratings, Reputation & Review Security
-- Milestone 8: Secure post-completion partner ratings & score calculation
-- ============================================================

-- 1. Constraints on trade_ratings
ALTER TABLE public.trade_ratings DROP CONSTRAINT IF EXISTS no_self_rating;
ALTER TABLE public.trade_ratings ADD CONSTRAINT no_self_rating CHECK (reviewer_id <> reviewed_id);

ALTER TABLE public.trade_ratings DROP CONSTRAINT IF EXISTS trade_ratings_comment_length;
ALTER TABLE public.trade_ratings ADD CONSTRAINT trade_ratings_comment_length 
  CHECK (comment IS NULL OR char_length(comment) <= 500);

-- 2. Indexes for fast reputation computation & trade lookup
CREATE INDEX IF NOT EXISTS idx_trade_ratings_reviewed_id ON public.trade_ratings(reviewed_id);
CREATE INDEX IF NOT EXISTS idx_trade_ratings_trade_id ON public.trade_ratings(trade_id);

-- 3. Hardened RLS on trade_ratings
ALTER TABLE public.trade_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow reading ratings" ON public.trade_ratings;
DROP POLICY IF EXISTS "Allow inserting rating as reviewer" ON public.trade_ratings;
DROP POLICY IF EXISTS "Disallow direct rating insertion" ON public.trade_ratings;
DROP POLICY IF EXISTS "Disallow rating updates" ON public.trade_ratings;
DROP POLICY IF EXISTS "Disallow rating deletion" ON public.trade_ratings;

-- SELECT policy: Anyone authenticated can view reputation feedback
CREATE POLICY "Allow reading ratings" 
  ON public.trade_ratings 
  FOR SELECT 
  TO authenticated 
  USING (true);

-- INSERT policy: Strictly require submission through the secure RPC
CREATE POLICY "Disallow direct rating insertion" 
  ON public.trade_ratings 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (false);

-- UPDATE & DELETE: Ratings are permanent and immutable
CREATE POLICY "Disallow rating updates" 
  ON public.trade_ratings 
  FOR UPDATE 
  TO authenticated 
  USING (false);

CREATE POLICY "Disallow rating deletion" 
  ON public.trade_ratings 
  FOR DELETE 
  TO authenticated 
  USING (false);

-- 4. Secure RPC function: submit_trade_rating
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
    -- 1. Identify reviewer strictly from auth context
    v_reviewer_id := auth.uid();
    IF v_reviewer_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Authentication required to submit rating.'
        );
    END IF;

    -- 2. Validate rating range (1 to 5)
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Rating must be an integer between 1 and 5 stars.'
        );
    END IF;

    -- 3. Validate comment length
    v_trimmed_comment := NULLIF(TRIM(p_comment), '');
    IF v_trimmed_comment IS NOT NULL AND char_length(v_trimmed_comment) > 500 THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Feedback comment cannot exceed 500 characters.'
        );
    END IF;

    -- 4. Verify caller account status
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = v_reviewer_id AND (is_banned = TRUE OR is_suspended = TRUE)
    ) THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Your account is restricted from submitting ratings.'
        );
    END IF;

    -- 5. Exclusively check trade record
    SELECT * INTO v_trade 
    FROM public.trades 
    WHERE id = p_trade_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Trade room does not exist.'
        );
    END IF;

    -- 6. Enforce that trade must be COMPLETED
    IF v_trade.status <> 'COMPLETED' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Ratings can only be submitted after a trade is fully COMPLETED.'
        );
    END IF;

    -- 7. Enforce reviewer participation and identify reviewed partner
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

    -- 8. Prevent self-rating
    IF v_reviewer_id = v_reviewed_id THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'You cannot rate yourself.'
        );
    END IF;

    -- 9. Enforce single rating per user per trade
    IF EXISTS (
        SELECT 1 FROM public.trade_ratings 
        WHERE trade_id = p_trade_id AND reviewer_id = v_reviewer_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'You have already submitted a rating for this trade partner.'
        );
    END IF;

    -- 10. Insert rating
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

    -- 11. Recalculate partner's reputation metrics
    SELECT 
        ROUND(AVG(rating)::numeric, 2), 
        COUNT(*)::INTEGER 
    INTO v_avg_score, v_rating_count 
    FROM public.trade_ratings 
    WHERE reviewed_id = v_reviewed_id;

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

-- 5. Permissions
REVOKE ALL ON FUNCTION public.submit_trade_rating(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_trade_rating(UUID, INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_trade_rating(UUID, INTEGER, TEXT) TO authenticated;

-- 6. Reload schema
NOTIFY pgrst, 'reload schema';
