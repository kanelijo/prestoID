-- Add missing columns found in app logs

-- 1. Add trial_started_at to institutes
ALTER TABLE public.institutes ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- 2. Add institute_id to community_posts
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS institute_id UUID REFERENCES public.institutes(id) ON DELETE CASCADE;
