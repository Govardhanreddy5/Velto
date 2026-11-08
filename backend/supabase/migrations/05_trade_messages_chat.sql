-- ============================================================
-- VELTO MIGRATION 05: Secure Realtime Trade Chat Data Layer
-- Milestone 6: Private In-Trade Realtime Messaging
-- ============================================================

-- 1. Ensure composite index for fast chronological message loading
CREATE INDEX IF NOT EXISTS idx_trade_messages_trade_id_created 
  ON public.trade_messages(trade_id, created_at ASC);

-- 2. Configure Full Replica Identity for Supabase Realtime
ALTER TABLE public.trade_messages REPLICA IDENTITY FULL;

-- Ensure table is in supabase_realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'trade_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_messages;
    END IF;
END $$;

-- 3. Hardened RLS Policies on trade_messages
ALTER TABLE public.trade_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow trade participants to read messages" ON public.trade_messages;
DROP POLICY IF EXISTS "Allow trade participants to send messages" ON public.trade_messages;
DROP POLICY IF EXISTS "Disallow message updates" ON public.trade_messages;
DROP POLICY IF EXISTS "Disallow message deletion" ON public.trade_messages;

-- SELECT policy: Only the requester and fulfiller of the specific trade may read its messages
CREATE POLICY "Allow trade participants to read messages" 
  ON public.trade_messages 
  FOR SELECT 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.trades t 
      WHERE t.id = trade_messages.trade_id 
        AND (t.requester_id = auth.uid() OR t.fulfiller_id = auth.uid())
    )
  );

-- INSERT policy: Strictly enforced:
-- 1. Sender must be authenticated and match auth.uid()
-- 2. Sender must be either the requester or fulfiller
-- 3. Trade must be IN_PROGRESS (cannot send messages after completion/cancellation)
-- 4. Sender cannot be suspended or banned
CREATE POLICY "Allow trade participants to send messages" 
  ON public.trade_messages 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    auth.uid() = sender_id 
    AND EXISTS (
      SELECT 1 FROM public.trades t 
      WHERE t.id = trade_messages.trade_id 
        AND (t.requester_id = auth.uid() OR t.fulfiller_id = auth.uid())
        AND t.status = 'IN_PROGRESS'
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() 
        AND p.is_banned = FALSE 
        AND p.is_suspended = FALSE
    )
  );

-- UPDATE & DELETE: Messages are immutable append-only audit records
CREATE POLICY "Disallow message updates" 
  ON public.trade_messages 
  FOR UPDATE 
  TO authenticated 
  USING (false);

CREATE POLICY "Disallow message deletion" 
  ON public.trade_messages 
  FOR DELETE 
  TO authenticated 
  USING (false);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
