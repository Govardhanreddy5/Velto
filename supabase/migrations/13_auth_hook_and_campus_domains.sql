-- ============================================================
-- VELTO MIGRATION 13: Strict Campus Domain Enforcement & Auth Hook
-- Multi-Campus Support: @vishnu.edu.in & @svecw.edu.in
-- ============================================================

-- 1. BEFORE USER CREATED POSTGRES AUTH HOOK
-- Rejects all signups except exact @vishnu.edu.in and @svecw.edu.in
CREATE OR REPLACE FUNCTION public.hook_restrict_velto_signup_domain(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    user_email TEXT;
    email_domain TEXT;
BEGIN
    user_email := LOWER(TRIM(COALESCE(event->'user'->>'email', '')));
    
    -- Extract domain part after '@'
    email_domain := SPLIT_PART(user_email, '@', 2);

    -- Strict check: allow only exact authorized college domains
    IF email_domain IN ('vishnu.edu.in', 'svecw.edu.in') THEN
        RETURN event;
    END IF;

    -- Reject all other domains (including subdomains, personal emails, generic .edu/.ac.in)
    RETURN jsonb_build_object(
        'error', jsonb_build_object(
            'http_code', 400,
            'message', 'Registration is restricted to authorized college domains: @vishnu.edu.in and @svecw.edu.in. Personal or unapproved domains are not permitted.'
        )
    );
END;
$$;

-- Secure permissions:
-- Grant execution ONLY to supabase_auth_admin
-- Revoke execution from public, anon, and authenticated
REVOKE ALL ON FUNCTION public.hook_restrict_velto_signup_domain(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hook_restrict_velto_signup_domain(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.hook_restrict_velto_signup_domain(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hook_restrict_velto_signup_domain(JSONB) TO supabase_auth_admin;


-- 2. HARDENED PROFILE TRIGGER: AUTOMATIC CAMPUS ASSIGNMENT
-- Derives campus strictly from verified email domain; ignores client metadata tampering.
-- Existing Vishnu users remain completely unchanged.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    extracted_roll TEXT;
    canonical_campus TEXT;
    email_domain TEXT;
BEGIN
    extracted_roll := COALESCE(
        NEW.raw_user_meta_data->>'roll_number',
        UPPER(SPLIT_PART(NEW.email, '@', 1))
    );

    email_domain := LOWER(TRIM(SPLIT_PART(NEW.email, '@', 2)));

    IF email_domain = 'svecw.edu.in' THEN
        canonical_campus := 'Shri Vishnu Engineering College for Women (SVECW)';
    ELSIF email_domain = 'vishnu.edu.in' THEN
        canonical_campus := 'Vishnu Educational Society';
    ELSE
        canonical_campus := 'Vishnu Educational Society';
    END IF;

    INSERT INTO public.profiles (
        id,
        email,
        roll_number,
        campus,
        is_verified
    )
    VALUES (
        NEW.id,
        NEW.email,
        extracted_roll,
        canonical_campus,
        TRUE
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        roll_number = EXCLUDED.roll_number,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. PREVENT MANUAL CAMPUS MODIFICATION
-- Users cannot select, switch, or alter their campus manually.
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Campus immutability check
    IF (OLD.campus IS DISTINCT FROM NEW.campus) THEN
        IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
            RAISE EXCEPTION 'Unauthorized: Campus affiliation cannot be modified manually.';
        END IF;
    END IF;

    -- Security & Disciplinary Flags (is_admin, is_banned, is_suspended)
    IF (OLD.is_admin IS DISTINCT FROM NEW.is_admin 
        OR OLD.is_banned IS DISTINCT FROM NEW.is_banned 
        OR OLD.is_suspended IS DISTINCT FROM NEW.is_suspended) THEN
        
        IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
            RAISE EXCEPTION 'Unauthorized: Only campus administrators can modify security or moderation attributes.';
        END IF;
    END IF;

    -- Reputation Metrics (rating_avg, total_ratings, total_trades)
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


-- 4. RLS POLICIES FOR STRICT CAMPUS FEED ISOLATION & REQUEST CREATION
-- Ensure exchange requests can only be seen by students from the same campus,
-- and requests cannot be created with a mismatched campus.
DROP POLICY IF EXISTS "requests_select_feed_or_own" ON public.exchange_requests;
CREATE POLICY "requests_select_feed_or_own"
    ON public.exchange_requests FOR SELECT
    TO authenticated
    USING (
        (
            status = 'OPEN' 
            AND expires_at > NOW() 
            AND campus = (SELECT p.campus FROM public.profiles p WHERE p.id = auth.uid())
        )
        OR requester_id = auth.uid()
        OR public.is_admin(auth.uid())
    );

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
        AND campus = (SELECT p.campus FROM public.profiles p WHERE p.id = auth.uid())
    );


-- 5. NOTIFY POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
