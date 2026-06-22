-- Phase 5: AI Test Engine Schema Fixes
-- Run this script in your Supabase Dashboard SQL Editor

-- 1. Create Test Banks table referencing businesses instead of institutes
CREATE TABLE IF NOT EXISTS public.test_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    file_url TEXT, -- Link to uploaded PDF/Image in Storage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Update test_questions table (Add explanation and topic_tag if missing)
ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS topic_tag TEXT;

-- 3. Update test_submissions table (Add exit_logs, is_offline_submission, total_questions)
ALTER TABLE public.test_submissions ADD COLUMN IF NOT EXISTS exit_logs JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.test_submissions ADD COLUMN IF NOT EXISTS is_offline_submission BOOLEAN DEFAULT false;
ALTER TABLE public.test_submissions ADD COLUMN IF NOT EXISTS total_questions INTEGER;

-- 4. Enable Row Level Security
ALTER TABLE public.test_banks ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.test_banks;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.test_banks;

CREATE POLICY "Enable read access for all users" ON public.test_banks FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.test_banks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Ensure correct policies for other tables referencing business_id
DROP POLICY IF EXISTS "Enable read access for all users" ON public.tests;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.tests;
DROP POLICY IF EXISTS "Enable update for all users" ON public.tests;

CREATE POLICY "Enable read access for all users" ON public.tests FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.tests FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Enable update for all users" ON public.tests FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.test_questions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.test_questions;
DROP POLICY IF EXISTS "Enable update for all users" ON public.test_questions;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.test_questions;

CREATE POLICY "Enable read access for all users" ON public.test_questions FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.test_questions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Enable update for all users" ON public.test_questions FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.test_questions FOR DELETE USING (true);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.test_submissions;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.test_submissions;
DROP POLICY IF EXISTS "Enable update for all users" ON public.test_submissions;

CREATE POLICY "Enable read access for all users" ON public.test_submissions FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.test_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.test_submissions FOR UPDATE USING (true);
