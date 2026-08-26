-- SQL migration to add avatar_url column to profiles table
-- Run this in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard)

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
