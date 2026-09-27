-- ============================================================
-- VELTO DATABASE SCHEMA
-- Campus-to-Campus Peer-to-Peer Cash ↔ UPI Exchange Platform
-- Project: cash-upi swap (csbdbhnvsykrsozwzdwk)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. ENUMS FOR TYPE SAFETY
-- ============================================================
CREATE TYPE trade_type AS ENUM ('need_cash', 'have_cash');
CREATE TYPE request_status AS ENUM ('open', 'matched', 'completed', 'cancelled', 'expired');
CREATE TYPE trade_status AS ENUM ('in_progress', 'completed', 'disputed', 'cancelled');
CREATE TYPE report_status AS ENUM ('pending', 'investigating', 'resolved', 'dismissed');

-- ============================================================
-- 2. PROFILES TABLE (Verified Students)
-- Linked directly to Supabase auth.users
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    roll_number TEXT NOT NULL,
    full_name TEXT,
    phone_number TEXT,
    upi_id TEXT,
    avatar_url TEXT,
    campus TEXT NOT NULL DEFAULT 'Vishnu Educational Society',
    is_verified BOOLEAN NOT NULL DEFAULT TRUE,
    rating_avg NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
    total_ratings INTEGER NOT NULL DEFAULT 0,
    total_trades INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. EXCHANGE REQUESTS TABLE
-- Campus feed for student cash <-> UPI requests
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exchange_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    request_type trade_type NOT NULL, -- 'need_cash' (paying UPI) or 'have_cash' (receiving UPI)
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0 AND amount <= 10000), -- Campus-friendly limit
    location_hint TEXT NOT NULL, -- e.g. "Canteen", "Library Block", "Main Gate"
    note TEXT,
    status request_status NOT NULL DEFAULT 'open',
    campus TEXT NOT NULL DEFAULT 'Vishnu Educational Society',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. TRADES TABLE (Trade Rooms)
-- Active trade between requester and student accepting the request
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES public.exchange_requests(id) ON DELETE RESTRICT,
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    acceptor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    amount NUMERIC(10, 2) NOT NULL,
    request_type trade_type NOT NULL,
    status trade_status NOT NULL DEFAULT 'in_progress',
    meetup_location TEXT NOT NULL,
    requester_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    acceptor_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    upi_reference TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    CONSTRAINT different_users CHECK (requester_id <> acceptor_id)
);

-- ============================================================
-- 5. TRADE MESSAGES TABLE (Realtime Chat)
-- Secure peer chat inside an active trade room
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trade_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (char_length(trim(message)) > 0 AND char_length(message) <= 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. RATINGS & REVIEWS TABLE
-- Peer trust score and feedback after completed trade
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trade_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewed_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT one_review_per_peer_per_trade UNIQUE (trade_id, reviewer_id)
);

-- ============================================================
-- 7. SAFETY REPORTS TABLE
-- Trust, safety & dispute reporting
-- ============================================================
CREATE TABLE IF NOT EXISTS public.safety_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    trade_id UUID REFERENCES public.trades(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    details TEXT,
    status report_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. AUTOMATIC PROFILE TRIGGER ON SIGNUP
-- Automatically creates a student profile when auth.users is created
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    extracted_roll TEXT;
    campus_name TEXT;
BEGIN
    -- Extract roll number from user metadata or email prefix (e.g. 24pa1a1210 -> 24PA1A1210)
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

-- Drop trigger if already exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_reports ENABLE ROW LEVEL SECURITY;

-- ----------------- PROFILES POLICIES -----------------
-- Anyone authenticated can view student profiles
CREATE POLICY "Allow authenticated users to read profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

-- Students can only update their own profile
CREATE POLICY "Allow users to update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- ----------------- EXCHANGE REQUESTS POLICIES -----------------
-- Any authenticated student can view open exchange requests
CREATE POLICY "Allow authenticated users to read exchange requests"
    ON public.exchange_requests FOR SELECT
    TO authenticated
    USING (true);

-- Verified students can create their own request
CREATE POLICY "Allow students to insert own exchange request"
    ON public.exchange_requests FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = requester_id);

-- Students can update their own request (cancel/edit)
CREATE POLICY "Allow students to update own request"
    ON public.exchange_requests FOR UPDATE
    TO authenticated
    USING (auth.uid() = requester_id);

-- ----------------- TRADES POLICIES -----------------
-- Only the participants (requester or acceptor) can view the trade
CREATE POLICY "Allow trade participants to view trade"
    ON public.trades FOR SELECT
    TO authenticated
    USING (auth.uid() = requester_id OR auth.uid() = acceptor_id);

-- Any authenticated user can create/accept a trade
CREATE POLICY "Allow authenticated users to create trade"
    ON public.trades FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = acceptor_id OR auth.uid() = requester_id);

-- Trade participants can update trade status (confirm cash / UPI)
CREATE POLICY "Allow trade participants to update trade"
    ON public.trades FOR UPDATE
    TO authenticated
    USING (auth.uid() = requester_id OR auth.uid() = acceptor_id);

-- ----------------- TRADE MESSAGES POLICIES -----------------
-- Participants of the trade can read chat messages
CREATE POLICY "Allow trade participants to read messages"
    ON public.trade_messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.trades t
            WHERE t.id = trade_messages.trade_id
            AND (t.requester_id = auth.uid() OR t.acceptor_id = auth.uid())
        )
    );

-- Participants of the trade can send messages
CREATE POLICY "Allow trade participants to send messages"
    ON public.trade_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM public.trades t
            WHERE t.id = trade_messages.trade_id
            AND (t.requester_id = auth.uid() OR t.acceptor_id = auth.uid())
        )
    );

-- ----------------- TRADE RATINGS POLICIES -----------------
CREATE POLICY "Allow reading ratings"
    ON public.trade_ratings FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow inserting rating as reviewer"
    ON public.trade_ratings FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = reviewer_id);

-- ----------------- SAFETY REPORTS POLICIES -----------------
CREATE POLICY "Allow users to create safety reports"
    ON public.safety_reports FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Allow reporters to view their own reports"
    ON public.safety_reports FOR SELECT
    TO authenticated
    USING (auth.uid() = reporter_id);

-- ============================================================
-- 10. ENABLE REALTIME
-- ============================================================
-- Enable Supabase Realtime for instant campus live-feed and chat
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.exchange_requests;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_messages;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
