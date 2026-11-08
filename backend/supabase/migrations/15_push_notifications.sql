-- ============================================================
-- VELTO MIGRATION 15: Secure Web Push Notifications for Exchange Requests
-- Standards-based VAPID Web Push with strict RLS and deduplication
-- ============================================================

-- 1. PUSH SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id 
    ON public.push_subscriptions(user_id);

-- 2. REQUEST NOTIFICATION DELIVERIES TABLE (Deduplication & Delivery Tracking)
CREATE TABLE IF NOT EXISTS public.request_notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.exchange_requests(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.push_subscriptions(id) ON DELETE SET NULL,
    delivery_status TEXT NOT NULL DEFAULT 'SENT' CHECK (delivery_status IN ('SENT', 'FAILED', 'EXPIRED')),
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_request_recipient_delivery UNIQUE (request_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_req_notif_deliveries_request 
    ON public.request_notification_deliveries(request_id);
CREATE INDEX IF NOT EXISTS idx_req_notif_deliveries_recipient 
    ON public.request_notification_deliveries(recipient_id);

-- 3. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_notification_deliveries ENABLE ROW LEVEL SECURITY;

-- 4. RLS POLICIES FOR PUSH SUBSCRIPTIONS
-- Strictly scoped to own user_id. Users can never view, mutate, or delete another student's subscription keys.
DROP POLICY IF EXISTS "push_subscriptions_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_select_own"
    ON public.push_subscriptions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions_insert_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_insert_own"
    ON public.push_subscriptions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions_update_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_update_own"
    ON public.push_subscriptions FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_delete_own"
    ON public.push_subscriptions FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- 5. RLS POLICIES FOR DELIVERIES
DROP POLICY IF EXISTS "deliveries_select_own" ON public.request_notification_deliveries;
CREATE POLICY "deliveries_select_own"
    ON public.request_notification_deliveries FOR SELECT
    TO authenticated
    USING (auth.uid() = recipient_id OR public.is_admin(auth.uid()));

-- 6. SECURITY DEFINER RPC: Upsert Push Subscription
CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
    p_endpoint TEXT,
    p_p256dh TEXT,
    p_auth TEXT,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_sub_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    -- Verify user profile exists, is onboarded and active
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_user_id
          AND is_onboarded = TRUE
          AND is_banned = FALSE
          AND is_suspended = FALSE
    ) THEN
        RAISE EXCEPTION 'User profile not eligible for push subscriptions';
    END IF;

    INSERT INTO public.push_subscriptions (
        user_id,
        endpoint,
        p256dh_key,
        auth_key,
        user_agent,
        updated_at
    )
    VALUES (
        v_user_id,
        p_endpoint,
        p_p256dh,
        p_auth,
        p_user_agent,
        NOW()
    )
    ON CONFLICT (endpoint)
    DO UPDATE SET
        user_id = v_user_id,
        p256dh_key = EXCLUDED.p256dh_key,
        auth_key = EXCLUDED.auth_key,
        user_agent = EXCLUDED.user_agent,
        updated_at = NOW()
    RETURNING id INTO v_sub_id;

    RETURN v_sub_id;
END;
$$;

-- 7. SECURITY DEFINER RPC: Delete User's Push Subscription
CREATE OR REPLACE FUNCTION public.delete_push_subscription(
    p_endpoint TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated request';
    END IF;

    IF p_endpoint IS NOT NULL AND p_endpoint <> '' THEN
        DELETE FROM public.push_subscriptions
        WHERE endpoint = p_endpoint AND user_id = v_user_id;
    ELSE
        DELETE FROM public.push_subscriptions
        WHERE user_id = v_user_id;
    END IF;

    RETURN FOUND;
END;
$$;

-- 8. SECURITY DEFINER RPC: Remove Invalid / Expired Endpoint (HTTP 404 / 410 Gone)
CREATE OR REPLACE FUNCTION public.delete_invalid_push_subscription(
    p_endpoint TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.push_subscriptions
    WHERE endpoint = p_endpoint;

    RETURN FOUND;
END;
$$;

-- 9. SECURITY DEFINER RPC: Get Eligible Subscribers for Request (Deduplicated & Filtered)
-- Rules enforced:
-- - Request must exist and be OPEN
-- - Never notify the requester (requester_id <> p.id)
-- - Recipient must be onboarded, verified, not banned, not suspended, on an approved campus
-- - Recipient must NOT have an existing delivery recorded for this request
CREATE OR REPLACE FUNCTION public.get_eligible_push_subscribers_for_request(
    p_request_id UUID
)
RETURNS TABLE (
    subscription_id UUID,
    recipient_id UUID,
    endpoint TEXT,
    p256dh_key TEXT,
    auth_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_requester_id UUID;
    v_status TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Look up the request
    SELECT requester_id, status, expires_at
    INTO v_requester_id, v_status, v_expires_at
    FROM public.exchange_requests
    WHERE id = p_request_id;

    IF v_requester_id IS NULL THEN
        RETURN;
    END IF;

    -- Only send for active OPEN requests
    IF v_status <> 'OPEN' OR v_expires_at <= NOW() THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        ps.id AS subscription_id,
        ps.user_id AS recipient_id,
        ps.endpoint,
        ps.p256dh_key,
        ps.auth_key
    FROM public.push_subscriptions ps
    JOIN public.profiles p ON p.id = ps.user_id
    WHERE ps.user_id <> v_requester_id
      AND p.is_onboarded = TRUE
      AND p.is_verified = TRUE
      AND p.is_banned = FALSE
      AND p.is_suspended = FALSE
      AND public.is_approved_campus(p.campus)
      -- Safe Deduplication: only if not already delivered/recorded for this request
      AND NOT EXISTS (
          SELECT 1 FROM public.request_notification_deliveries rnd
          WHERE rnd.request_id = p_request_id
            AND rnd.recipient_id = ps.user_id
      );
END;
$$;

-- 10. SECURITY DEFINER RPC: Record Push Notification Delivery (Deduplication record)
CREATE OR REPLACE FUNCTION public.record_push_notification_delivery(
    p_request_id UUID,
    p_recipient_id UUID,
    p_subscription_id UUID,
    p_status TEXT DEFAULT 'SENT'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.request_notification_deliveries (
        request_id,
        recipient_id,
        subscription_id,
        delivery_status,
        delivered_at
    )
    VALUES (
        p_request_id,
        p_recipient_id,
        p_subscription_id,
        p_status,
        NOW()
    )
    ON CONFLICT (request_id, recipient_id)
    DO UPDATE SET
        delivery_status = EXCLUDED.delivery_status,
        subscription_id = EXCLUDED.subscription_id,
        delivered_at = NOW();
END;
$$;

-- Grant permissions to authenticated role
GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_invalid_push_subscription(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_eligible_push_subscribers_for_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_push_notification_delivery(UUID, UUID, UUID, TEXT) TO authenticated;
