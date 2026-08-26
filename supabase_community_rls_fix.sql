-- SQL Script to fix community posts Row Level Security (RLS) policies
-- This allows students (authenticated users) to like and comment on community posts
-- Run this script in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard)

-- 1. Drop existing policy if it conflicts
DROP POLICY IF EXISTS "Allow authenticated users to update community posts" ON public.community_posts;

-- 2. Create UPDATE policy: Allow authenticated users to update community posts
CREATE POLICY "Allow authenticated users to update community posts" ON public.community_posts
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
