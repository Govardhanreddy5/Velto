-- ============================================================
-- VELTO MILESTONE 1 MIGRATION: Database and Security Foundation
-- Project: cash-upi swap (csbdbhnvsykrsozwzdwk)
-- ============================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. PROFILES TABLE (Verified Students)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    roll_number TEXT NOT NULL,
    full_name TEXT,
    department TEXT,
    year_of_study INTEGER CHECK (year_of_study BETWEEN 1 AND 5),
    upi_id TEXT,
    avatar_url TEXT,
    campus TEXT NOT NULL DEFAULT 'Vishnu Educational Society',
    is_onboarded BOOLEAN NOT NULL DEFAULT FALSE,
    is_verified BOOLEAN NOT NULL DEFAULT TRUE,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    rating_avg NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
    total_ratings INTEGER NOT NULL DEFAULT 0,
    total_trades INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure required columns exist if profiles table was created earlier
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS year_of_study INTEGER CHECK (year_of_study BETWEEN 1 AND 5);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;

-- Helper function: Check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = user_id AND is_admin = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. EXCHANGE REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.exchange_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    request_type TEXT NOT NULL CHECK (request_type IN ('NEED_CASH', 'HAVE_CASH_WANT_UPI')),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 20.00 AND amount <= 500.00), -- Strict ₹20–₹500 limit
    location_hint TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACCEPTED', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
    campus TEXT NOT NULL DEFAULT 'Vishnu Educational Society',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- In case exchange_requests already exists, update check constraints
ALTER TABLE public.exchange_requests DROP CONSTRAINT IF EXISTS exchange_requests_amount_check;
ALTER TABLE public.exchange_requests ADD CONSTRAINT exchange_requests_amount_check CHECK (amount >= 20.00 AND amount <= 500.00);

ALTER TABLE public.exchange_requests DROP CONSTRAINT IF EXISTS exchange_requests_request_type_check;
ALTER TABLE public.exchange_requests ADD CONSTRAINT exchange_requests_request_type_check CHECK (request_type IN ('NEED_CASH', 'HAVE_CASH_WANT_UPI'));

ALTER TABLE public.exchange_requests DROP CONSTRAINT IF EXISTS exchange_requests_status_check;
ALTER TABLE public.exchange_requests ADD CONSTRAINT exchange_requests_status_check CHECK (status IN ('OPEN', 'ACCEPTED', 'COMPLETED', 'EXPIRED', 'CANCELLED'));

-- 4. TRADES TABLE (Trade Rooms)
CREATE TABLE IF NOT EXISTS public.trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES public.exchange_requests(id) ON DELETE RESTRICT,
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    fulfiller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 20.00 AND amount <= 500.00),
    request_type TEXT NOT NULL CHECK (request_type IN ('NEED_CASH', 'HAVE_CASH_WANT_UPI')),
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED')),
    meetup_location TEXT NOT NULL,
    requester_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    fulfiller_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    upi_reference TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    CONSTRAINT different_participants CHECK (requester_id <> fulfiller_id)
);

-- Migrate column names from earlier draft if needed
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trades' AND column_name = 'acceptor_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trades' AND column_name = 'fulfiller_id'
    ) THEN
        ALTER TABLE public.trades RENAME COLUMN acceptor_id TO fulfiller_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trades' AND column_name = 'acceptor_confirmed'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trades' AND column_name = 'fulfiller_confirmed'
    ) THEN
        ALTER TABLE public.trades RENAME COLUMN acceptor_confirmed TO fulfiller_confirmed;
    END IF;
END $$;

ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_amount_check;
ALTER TABLE public.trades ADD CONSTRAINT trades_amount_check CHECK (amount >= 20.00 AND amount <= 500.00);

-- 5. TRADE MESSAGES TABLE (Realtime Chat)
CREATE TABLE IF NOT EXISTS public.trade_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (char_length(trim(message)) > 0 AND char_length(message) <= 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. RATINGS & REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.trade_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewed_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT one_rating_per_participant UNIQUE (trade_id, reviewer_id),
    CONSTRAINT no_self_rating CHECK (reviewer_id <> reviewed_id)
);

-- 7. SAFETY REPORTS TABLE
CREATE TABLE IF NOT EXISTS public.safety_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    trade_id UUID REFERENCES public.trades(id) ON DELETE SET NULL,
    reason TEXT NOT NULL CHECK (reason IN ('NO_SHOW', 'WRONG_AMOUNT', 'DID_NOT_RECEIVE_CASH', 'DID_NOT_RECEIVE_UPI', 'FRAUD_SUSPICION', 'OTHER')),
    details TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_requests_feed ON public.exchange_requests(status, expires_at) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_requests_requester ON public.exchange_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_trades_requester ON public.trades(requester_id);
CREATE INDEX IF NOT EXISTS idx_trades_fulfiller ON public.trades(fulfiller_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON public.trades(status);
CREATE INDEX IF NOT EXISTS idx_trade_messages_trade ON public.trade_messages(trade_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trade_ratings_reviewed ON public.trade_ratings(reviewed_id);
CREATE INDEX IF NOT EXISTS idx_safety_reports_status ON public.safety_reports(status);

-- 9. AUTOMATIC PROFILE TRIGGER ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    extracted_roll TEXT;
    campus_name TEXT;
BEGIN
    extracted_roll := COALESCE(
        NEW.raw_user_meta_data->>'roll_number',
        UPPER(SPLIT_PART(NEW.email, '@', 1))
    );

    campus_name := COALESCE(
        NEW.raw_user_meta_data->>'campus',
        'Vishnu Educational Society'
    );

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
        campus_name,
        TRUE
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        roll_number = EXCLUDED.roll_number,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 10. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_reports ENABLE ROW LEVEL SECURITY;

-- Drop existing policies cleanly
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- ----------------- PROFILES POLICIES -----------------
-- Authenticated users can view profiles
CREATE POLICY "profiles_select_authenticated"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

-- Students can only update their own profile
CREATE POLICY "profiles_update_own"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ----------------- REQUESTS POLICIES -----------------
-- Feed: Open unexpired requests or user's own requests
CREATE POLICY "requests_select_feed_or_own"
    ON public.exchange_requests FOR SELECT
    TO authenticated
    USING (
        (status = 'OPEN' AND expires_at > NOW())
        OR requester_id = auth.uid()
        OR public.is_admin(auth.uid())
    );

-- Users can create requests only for themselves and if not suspended/banned
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

-- Requester can update or cancel their own open request
CREATE POLICY "requests_update_own"
    ON public.exchange_requests FOR UPDATE
    TO authenticated
    USING (auth.uid() = requester_id OR public.is_admin(auth.uid()))
    WITH CHECK (auth.uid() = requester_id OR public.is_admin(auth.uid()));

-- ----------------- TRADES POLICIES -----------------
-- Trade participants or admins alone can access their trade
CREATE POLICY "trades_select_participants_or_admin"
    ON public.trades FOR SELECT
    TO authenticated
    USING (
        auth.uid() = requester_id 
        OR auth.uid() = fulfiller_id 
        OR public.is_admin(auth.uid())
    );

-- Trade participants can update trade confirmation flags
CREATE POLICY "trades_update_participants"
    ON public.trades FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = requester_id 
        OR auth.uid() = fulfiller_id 
        OR public.is_admin(auth.uid())
    );

-- Authenticated participant can insert a trade
CREATE POLICY "trades_insert_participants"
    ON public.trades FOR INSERT
    TO authenticated
    WITH CHECK (
        (auth.uid() = fulfiller_id OR auth.uid() = requester_id)
        AND requester_id <> fulfiller_id
    );

-- ----------------- TRADE MESSAGES POLICIES -----------------
-- Trade participants alone can read messages for their trade
CREATE POLICY "trade_messages_select_participants"
    ON public.trade_messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.trades t
            WHERE t.id = trade_messages.trade_id
            AND (t.requester_id = auth.uid() OR t.fulfiller_id = auth.uid() OR public.is_admin(auth.uid()))
        )
    );

-- Trade participants alone can write messages to active trade
CREATE POLICY "trade_messages_insert_participants"
    ON public.trade_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (
            SELECT 1 FROM public.trades t
            WHERE t.id = trade_messages.trade_id
            AND (t.requester_id = auth.uid() OR t.fulfiller_id = auth.uid())
            AND t.status = 'IN_PROGRESS'
        )
    );

-- ----------------- TRADE RATINGS POLICIES -----------------
-- All authenticated users can view ratings for reputation
CREATE POLICY "trade_ratings_select_all"
    ON public.trade_ratings FOR SELECT
    TO authenticated
    USING (true);

-- Users can rate only eligible completed-trade partners
CREATE POLICY "trade_ratings_insert_eligible"
    ON public.trade_ratings FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = reviewer_id
        AND reviewer_id <> reviewed_id
        AND EXISTS (
            SELECT 1 FROM public.trades t
            WHERE t.id = trade_ratings.trade_id
            AND t.status = 'COMPLETED'
            AND (
                (t.requester_id = reviewer_id AND t.fulfiller_id = reviewed_id)
                OR
                (t.fulfiller_id = reviewer_id AND t.requester_id = reviewed_id)
            )
        )
    );

-- ----------------- SAFETY REPORTS POLICIES -----------------
-- Users can create reports related to eligible trades
CREATE POLICY "safety_reports_insert_participant"
    ON public.safety_reports FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = reporter_id
        AND (
            trade_id IS NULL
            OR EXISTS (
                SELECT 1 FROM public.trades t
                WHERE t.id = safety_reports.trade_id
                AND (t.requester_id = reporter_id OR t.fulfiller_id = reporter_id)
            )
        )
    );

-- Reporters can view their own reports; admins can view all reports
CREATE POLICY "safety_reports_select_reporter_or_admin"
    ON public.safety_reports FOR SELECT
    TO authenticated
    USING (
        auth.uid() = reporter_id 
        OR public.is_admin(auth.uid())
    );

-- Admins alone can review reports and manage moderation
CREATE POLICY "safety_reports_update_admin_only"
    ON public.safety_reports FOR UPDATE
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- 11. SECURE FUNCTION: GET PARTNER UPI ID
CREATE OR REPLACE FUNCTION public.get_trade_partner_upi(p_trade_id UUID)
RETURNS TEXT AS $$
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

    IF auth.uid() <> v_requester AND auth.uid() <> v_fulfiller AND NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized';
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. ENABLE REALTIME
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.exchange_requests;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_messages;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
