-- SQL Script to add media and file attachment columns to the community_posts table
-- Copy and run this script in your Supabase SQL Editor (https://supabase.com/dashboard):

ALTER TABLE public.community_posts
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT;
