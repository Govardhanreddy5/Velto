-- ============================================================
-- VELTO MIGRATION 12: Safety Reports Admin Access Policy
-- Enables platform administrators to view and manage all student safety reports
-- ============================================================

DROP POLICY IF EXISTS "Allow reporters to view their own reports" ON public.safety_reports;
DROP POLICY IF EXISTS "Allow reporters and admins to view reports" ON public.safety_reports;

CREATE POLICY "Allow reporters and admins to view reports"
    ON public.safety_reports FOR SELECT
    TO authenticated
    USING (
        (auth.uid() = reporter_id) OR
        public.is_admin(auth.uid())
    );

DROP POLICY IF EXISTS "Allow admins to update safety reports" ON public.safety_reports;

CREATE POLICY "Allow admins to update safety reports"
    ON public.safety_reports FOR UPDATE
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
