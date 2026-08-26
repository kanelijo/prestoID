-- SQL migration to add is_edited column to community_posts table
-- Run this in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard)

ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
