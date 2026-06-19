-- SQL Script to set up the avatars storage bucket and define Row Level Security (RLS) policies
-- Run this script in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard)

-- 1. Create the 'avatars' bucket if it does not exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop existing RLS policies on storage.objects for the avatars bucket
DROP POLICY IF EXISTS "Allow public read of avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated inserts to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes to avatars" ON storage.objects;

-- 3. Create SELECT policy: Allow public read access to avatars
CREATE POLICY "Allow public read of avatars" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- 4. Create INSERT policy: Allow authenticated users to upload files to avatars bucket
CREATE POLICY "Allow authenticated inserts to avatars" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

-- 5. Create UPDATE policy: Allow authenticated users to update files in avatars bucket
CREATE POLICY "Allow authenticated updates to avatars" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');

-- 6. Create DELETE policy: Allow authenticated users to delete files in avatars bucket
CREATE POLICY "Allow authenticated deletes to avatars" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');
