-- SQL Script to resolve Row-Level Security (RLS) policies for PrestoID

-- ===================================================
-- 1. FIX STUDENTS TABLE POLICIES
-- ===================================================

-- Allow students to insert their own student record during onboarding
DROP POLICY IF EXISTS "Allow users to insert own student record" ON public.students;
CREATE POLICY "Allow users to insert own student record" ON public.students
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enhance student update policy to allow email-based matching/linking as a fail-safe
DROP POLICY IF EXISTS "Allow users to update own student record" ON public.students;
CREATE POLICY "Allow users to update own student record" ON public.students 
  FOR UPDATE USING (
    auth.uid() = user_id 
    OR email = (auth.jwt() ->> 'email')
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ===================================================
-- 2. FIX COMMUNITY POSTS UPDATE POLICY
-- ===================================================

-- Allow authenticated users (both students and admins) to update posts (like count and comments)
DROP POLICY IF EXISTS "Allow authenticated users to update community posts" ON public.community_posts;
CREATE POLICY "Allow authenticated users to update community posts" ON public.community_posts
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ===================================================
-- 3. FIX STORAGE POLICIES FOR AVATARS BUCKET
-- ===================================================

-- Re-configure authenticated storage policies to allow upserting (INSERT + UPDATE) and deleting avatars
DROP POLICY IF EXISTS "Authenticated Upload Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete Avatars" ON storage.objects;

-- Allow insert
CREATE POLICY "Authenticated Upload Avatars" ON storage.objects 
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- Allow update (required for upsert: true)
CREATE POLICY "Authenticated Update Avatars" ON storage.objects 
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- Allow delete (required if replacing/cleaning up old avatars)
CREATE POLICY "Authenticated Delete Avatars" ON storage.objects 
  FOR DELETE USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');
