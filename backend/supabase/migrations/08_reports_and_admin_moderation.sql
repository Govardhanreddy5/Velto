-- ============================================================
-- VELTO MIGRATION 08: Reports, Disputes & Secure Admin Moderation
-- Milestone 9: Safety reports, audit logs & privilege protection
-- ============================================================

-- 0. Helper Function: is_admin
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
        WHERE id = user_id AND is_admin = TRUE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO service_role;

-- 1. Table: moderation_audit_logs
CREATE TABLE IF NOT EXISTS public.moderation_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('SUSPEND_USER', 'BAN_USER', 'RESTORE_USER', 'UPDATE_REPORT_STATUS')),
    reason TEXT NOT NULL,
    report_id UUID REFERENCES public.safety_reports(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mod_audit_admin ON public.moderation_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_mod_audit_target ON public.moderation_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_mod_audit_created ON public.moderation_audit_logs(created_at DESC);

ALTER TABLE public.moderation_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view moderation audit logs" ON public.moderation_audit_logs;
CREATE POLICY "Admins can view moderation audit logs"
    ON public.moderation_audit_logs FOR SELECT
    TO authenticated
    USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Disallow direct audit log insert" ON public.moderation_audit_logs;
CREATE POLICY "Disallow direct audit log insert"
    ON public.moderation_audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Disallow audit log update" ON public.moderation_audit_logs;
CREATE POLICY "Disallow audit log update"
    ON public.moderation_audit_logs FOR UPDATE
    TO authenticated
    USING (false);

DROP POLICY IF EXISTS "Disallow audit log delete" ON public.moderation_audit_logs;
CREATE POLICY "Disallow audit log delete"
    ON public.moderation_audit_logs FOR DELETE
    TO authenticated
    USING (false);

-- 2. Schema Enhancements on safety_reports
ALTER TABLE public.safety_reports 
    ADD COLUMN IF NOT EXISTS admin_notes TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Convert status to text with uppercase canonical values
ALTER TABLE public.safety_reports ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.safety_reports ALTER COLUMN status TYPE TEXT USING UPPER(status::text);
ALTER TABLE public.safety_reports ALTER COLUMN status SET DEFAULT 'PENDING';

ALTER TABLE public.safety_reports DROP CONSTRAINT IF EXISTS safety_reports_status_check;
ALTER TABLE public.safety_reports ADD CONSTRAINT safety_reports_status_check 
    CHECK (status IN ('PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'));

ALTER TABLE public.safety_reports DROP CONSTRAINT IF EXISTS safety_reports_details_length;
ALTER TABLE public.safety_reports ADD CONSTRAINT safety_reports_details_length 
    CHECK (details IS NULL OR char_length(details) <= 1000);

ALTER TABLE public.safety_reports DROP CONSTRAINT IF EXISTS safety_reports_reason_check;
ALTER TABLE public.safety_reports ADD CONSTRAINT safety_reports_reason_check 
    CHECK (reason IN ('NO_SHOW', 'WRONG_AMOUNT', 'DID_NOT_RECEIVE_CASH', 'DID_NOT_RECEIVE_UPI', 'FRAUD_SUSPICION', 'OTHER'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_trade_report 
    ON public.safety_reports(trade_id, reporter_id, reason) 
    WHERE status IN ('PENDING', 'INVESTIGATING');

CREATE INDEX IF NOT EXISTS idx_safety_reports_trade_id ON public.safety_reports(trade_id);
CREATE INDEX IF NOT EXISTS idx_safety_reports_reporter ON public.safety_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_safety_reports_reported ON public.safety_reports(reported_user_id);

-- 3. Trigger: Prevent non-admins from self-promoting or altering moderation/reputation flags
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (OLD.is_admin IS DISTINCT FROM NEW.is_admin 
        OR OLD.is_banned IS DISTINCT FROM NEW.is_banned 
        OR OLD.is_suspended IS DISTINCT FROM NEW.is_suspended
        OR OLD.rating_avg IS DISTINCT FROM NEW.rating_avg
        OR OLD.total_ratings IS DISTINCT FROM NEW.total_ratings
        OR OLD.total_trades IS DISTINCT FROM NEW.total_trades) THEN
        
        -- Block if caller is not an administrator
        IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
            RAISE EXCEPTION 'Unauthorized: Only campus administrators can modify security, moderation, or reputation attributes.';
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

-- 4. Trade Messages: allow administrators investigating reports to read trade messages
DROP POLICY IF EXISTS "Allow trade participants to read messages" ON public.trade_messages;
DROP POLICY IF EXISTS "Allow trade participants and admins to read messages" ON public.trade_messages;
CREATE POLICY "Allow trade participants and admins to read messages" 
  ON public.trade_messages 
  FOR SELECT 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.trades t 
      WHERE t.id = trade_messages.trade_id 
        AND (t.requester_id = auth.uid() OR t.fulfiller_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

-- 4b. Enforce suspended/banned restriction on exchange request creation at DB layer
DROP POLICY IF EXISTS "Allow students to insert own exchange request" ON public.exchange_requests;
DROP POLICY IF EXISTS "requests_insert_own" ON public.exchange_requests;
CREATE POLICY "requests_insert_own"
    ON public.exchange_requests FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = requester_id
        AND NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND (is_banned = TRUE OR is_suspended = TRUE)
        )
    );

-- 5. Secure RPC: submit_trade_report
CREATE OR REPLACE FUNCTION public.submit_trade_report(
    p_trade_id UUID,
    p_reason TEXT,
    p_details TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_reporter_id UUID;
    v_reported_id UUID;
    v_trade RECORD;
    v_trimmed_details TEXT;
    v_report_id UUID;
BEGIN
    -- 1. Identify reporter from auth context
    v_reporter_id := auth.uid();
    IF v_reporter_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
    END IF;

    -- 2. Verify reporter is not banned or suspended
    IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_reporter_id AND (is_banned = TRUE OR is_suspended = TRUE)
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Your account is restricted from submitting reports.');
    END IF;

    -- 3. Validate reason
    IF p_reason NOT IN ('NO_SHOW', 'WRONG_AMOUNT', 'DID_NOT_RECEIVE_CASH', 'DID_NOT_RECEIVE_UPI', 'FRAUD_SUSPICION', 'OTHER') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid report reason.');
    END IF;

    -- 4. Validate details length
    v_trimmed_details := NULLIF(TRIM(p_details), '');
    IF v_trimmed_details IS NOT NULL AND char_length(v_trimmed_details) > 1000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Report details cannot exceed 1,000 characters.');
    END IF;

    -- 5. Find trade
    SELECT * INTO v_trade
    FROM public.trades
    WHERE id = p_trade_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trade room not found.');
    END IF;

    -- 6. Enforce reviewer participation
    IF v_reporter_id = v_trade.requester_id THEN
        v_reported_id := v_trade.fulfiller_id;
    ELSIF v_reporter_id = v_trade.fulfiller_id THEN
        v_reported_id := v_trade.requester_id;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Access denied: You are not a participant in this trade.');
    END IF;

    -- 7. Check for duplicate open report
    IF EXISTS (
        SELECT 1 FROM public.safety_reports
        WHERE trade_id = p_trade_id
          AND reporter_id = v_reporter_id
          AND reason = p_reason
          AND status IN ('PENDING', 'INVESTIGATING')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You already have an open report for this issue on this trade.');
    END IF;

    -- 8. Insert report
    INSERT INTO public.safety_reports (
        reporter_id,
        reported_user_id,
        trade_id,
        reason,
        details,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_reporter_id,
        v_reported_id,
        p_trade_id,
        p_reason,
        v_trimmed_details,
        'PENDING',
        NOW(),
        NOW()
    ) RETURNING id INTO v_report_id;

    RETURN jsonb_build_object(
        'success', true,
        'report_id', v_report_id,
        'message', 'Report submitted successfully. Campus moderation has been notified.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_trade_report(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_trade_report(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_trade_report(UUID, TEXT, TEXT) TO authenticated;

-- 6. Secure RPC: admin_moderate_user
CREATE OR REPLACE FUNCTION public.admin_moderate_user(
    p_target_user_id UUID,
    p_action TEXT,
    p_reason TEXT,
    p_report_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_trimmed_reason TEXT;
    v_target_profile RECORD;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Admin privileges required.');
    END IF;

    IF v_admin_id = p_target_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Administrators cannot moderate their own account.');
    END IF;

    v_trimmed_reason := NULLIF(TRIM(p_reason), '');
    IF v_trimmed_reason IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'A clear justification reason is required for moderation actions.');
    END IF;

    IF p_action NOT IN ('SUSPEND_USER', 'BAN_USER', 'RESTORE_USER') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid moderation action.');
    END IF;

    SELECT * INTO v_target_profile
    FROM public.profiles
    WHERE id = p_target_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target user profile not found.');
    END IF;

    IF p_action = 'SUSPEND_USER' THEN
        UPDATE public.profiles
        SET is_suspended = TRUE, updated_at = NOW()
        WHERE id = p_target_user_id;
    ELSIF p_action = 'BAN_USER' THEN
        UPDATE public.profiles
        SET is_banned = TRUE, updated_at = NOW()
        WHERE id = p_target_user_id;
    ELSIF p_action = 'RESTORE_USER' THEN
        UPDATE public.profiles
        SET is_suspended = FALSE, is_banned = FALSE, updated_at = NOW()
        WHERE id = p_target_user_id;
    END IF;

    -- Record in audit log
    INSERT INTO public.moderation_audit_logs (
        admin_id,
        target_user_id,
        action,
        reason,
        report_id,
        created_at
    ) VALUES (
        v_admin_id,
        p_target_user_id,
        p_action,
        v_trimmed_reason,
        p_report_id,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'action', p_action,
        'target_user_id', p_target_user_id,
        'message', 'User account successfully moderated.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_moderate_user(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_moderate_user(UUID, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_user(UUID, TEXT, TEXT, UUID) TO authenticated;

-- 7. Secure RPC: admin_update_report_status
CREATE OR REPLACE FUNCTION public.admin_update_report_status(
    p_report_id UUID,
    p_status TEXT,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_report RECORD;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Admin privileges required.');
    END IF;

    IF p_status NOT IN ('INVESTIGATING', 'RESOLVED', 'DISMISSED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid report status.');
    END IF;

    SELECT * INTO v_report
    FROM public.safety_reports
    WHERE id = p_report_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Report not found.');
    END IF;

    UPDATE public.safety_reports
    SET 
        status = p_status,
        admin_notes = COALESCE(p_admin_notes, admin_notes),
        updated_at = NOW()
    WHERE id = p_report_id;

    -- Record audit log
    INSERT INTO public.moderation_audit_logs (
        admin_id,
        target_user_id,
        action,
        reason,
        report_id,
        created_at
    ) VALUES (
        v_admin_id,
        v_report.reported_user_id,
        'UPDATE_REPORT_STATUS',
        CONCAT('Updated report status to ', p_status, COALESCE(CONCAT(': ', p_admin_notes), '')),
        p_report_id,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'report_id', p_report_id,
        'status', p_status,
        'message', 'Report status successfully updated.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_report_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_report_status(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_report_status(UUID, TEXT, TEXT) TO authenticated;

-- 8. Reload postgREST schema cache
NOTIFY pgrst, 'reload schema';
