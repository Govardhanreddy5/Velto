-- ============================================================
-- VELTO MIGRATION 10: Avatars Storage Bucket & Policies
-- Milestone 10: User profile picture storage
-- ============================================================

-- 1. Create avatars bucket in Supabase storage if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars', 
    'avatars', 
    true, 
    5242880, 
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Storage Policies for avatars
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
CREATE POLICY "Public can view avatars" 
    ON storage.objects FOR SELECT 
    USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars" 
    ON storage.objects FOR INSERT 
    TO authenticated 
    WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar" 
    ON storage.objects FOR UPDATE 
    TO authenticated 
    USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar" 
    ON storage.objects FOR DELETE 
    TO authenticated 
    USING (bucket_id = 'avatars');

-- 3. Reload schema cache
NOTIFY pgrst, 'reload schema';
