-- SQL Script to add liked_by column to community_posts
-- Run this in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard)

-- 1. Add liked_by JSONB column with default empty array
ALTER TABLE public.community_posts 
ADD COLUMN IF NOT EXISTS liked_by JSONB DEFAULT '[]'::jsonb;

-- 2. Drop existing update policy if it conflicts
DROP POLICY IF EXISTS "Allow authenticated users to update community posts" ON public.community_posts;

-- 3. Ensure authenticated users (students and admins) can update posts (needed to update likes/comments)
CREATE POLICY "Allow authenticated users to update community posts" ON public.community_posts
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
