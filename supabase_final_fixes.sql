-- SQL Script to finalize storage policies and constraints for PrestoID
-- Run this script in your Supabase Dashboard SQL Editor

-- ===================================================
-- 1. FIX STORAGE POLICIES FOR AVATARS BUCKET
-- ===================================================

-- Drop existing policies on storage.objects to prevent duplicates or conflicts
DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admin Manage Avatars" ON storage.objects;

-- Allow anyone to read avatars from the public bucket
CREATE POLICY "Public Read Avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Allow all authenticated users (both students and admins) to upload (insert) files to avatars bucket
CREATE POLICY "Authenticated Upload Avatars" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

-- Allow all authenticated users (both students and admins) to update files in avatars bucket
CREATE POLICY "Authenticated Update Avatars" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars') WITH CHECK (bucket_id = 'avatars');

-- Allow all authenticated users (both students and admins) to delete files in avatars bucket
CREATE POLICY "Authenticated Delete Avatars" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'avatars');

-- ===================================================
-- 2. FIX STORAGE BUCKETS POLICIES
-- ===================================================

-- Allow authenticated users to view buckets (required by the Supabase client library on initialization/upload)
DROP POLICY IF EXISTS "Allow authenticated read of buckets" ON storage.buckets;
CREATE POLICY "Allow authenticated read of buckets" ON storage.buckets
  FOR SELECT TO authenticated USING (true);

-- ===================================================
-- 3. FIX STUDENTS TABLE UNIQUE CONSTRAINT & POLICIES
-- ===================================================

-- Ensure user_id column exists
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Enforce a unique constraint on user_id to prevent multiple student profiles per auth user
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_user_id_key;
ALTER TABLE public.students ADD CONSTRAINT students_user_id_key UNIQUE (user_id);

-- Ensure students can insert their own student record during profile setup/onboarding
DROP POLICY IF EXISTS "Allow users to insert own student record" ON public.students;
CREATE POLICY "Allow users to insert own student record" ON public.students
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Ensure students can update their own student record, and admins can manage all records
DROP POLICY IF EXISTS "Allow users to update own student record" ON public.students;
CREATE POLICY "Allow users to update own student record" ON public.students 
  FOR UPDATE USING (
    auth.uid() = user_id 
    OR email = (auth.jwt() ->> 'email')
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
