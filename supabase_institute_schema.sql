-- SQL Script to implement Multi-Tenant Institute Schema & Student Roster Syncing
-- Run this script in your Supabase Dashboard SQL Editor

-- ===================================================
-- 1. CREATE INSTITUTES TABLE
-- ===================================================

CREATE TABLE IF NOT EXISTS public.institutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('Coaching', 'Library', 'School')),
  invite_code TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  phone TEXT,
  address TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ===================================================
-- 2. ENABLE ROW LEVEL SECURITY & DEFINE POLICIES ON INSTITUTES
-- ===================================================

ALTER TABLE public.institutes ENABLE ROW LEVEL SECURITY;

-- Allow public read of institutes (required for students to search by invite code)
DROP POLICY IF EXISTS "Allow public read of institutes" ON public.institutes;
CREATE POLICY "Allow public read of institutes" ON public.institutes
  FOR SELECT USING (true);

-- Allow authenticated users to insert their own institute profile
DROP POLICY IF EXISTS "Allow users to insert own institute" ON public.institutes;
CREATE POLICY "Allow users to insert own institute" ON public.institutes
  FOR INSERT WITH CHECK (auth.uid() = admin_id);

-- Allow admins to update their own institute profile
DROP POLICY IF EXISTS "Allow admins to update own institute" ON public.institutes;
CREATE POLICY "Allow admins to update own institute" ON public.institutes
  FOR UPDATE USING (auth.uid() = admin_id);

-- Allow admins to delete their own institute profile
DROP POLICY IF EXISTS "Allow admins to delete own institute" ON public.institutes;
CREATE POLICY "Allow admins to delete own institute" ON public.institutes
  FOR DELETE USING (auth.uid() = admin_id);

-- ===================================================
-- 3. LINK & MODIFY STUDENTS FOR MANUAL ENTRY
-- ===================================================

-- Drop old foreign key constraint from students(id) to auth.users(id) to allow manual registration
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_id_fkey;

-- Set default value for id to be a random UUID
ALTER TABLE public.students ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Add user_id column referencing auth.users(id) to link students on claim
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_user_id_key;
ALTER TABLE public.students ADD CONSTRAINT students_user_id_key UNIQUE (user_id);

-- Add institute_id column referencing public.institutes(id)
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS institute_id UUID REFERENCES public.institutes(id) ON DELETE SET NULL;

-- Add verification identifiers
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS aadhaar_number TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS secret_code TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS duration TEXT;

-- Enforce uniqueness of verification identifiers
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_aadhaar_number_key;
ALTER TABLE public.students ADD CONSTRAINT students_aadhaar_number_key UNIQUE (aadhaar_number);

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_secret_code_key;
ALTER TABLE public.students ADD CONSTRAINT students_secret_code_key UNIQUE (secret_code);

-- ===================================================
-- 4. ADJUST RLS POLICIES FOR STUDENTS TABLE
-- ===================================================

-- Update update policy to match user_id instead of id
DROP POLICY IF EXISTS "Allow users to update own student record" ON public.students;
CREATE POLICY "Allow users to update own student record" ON public.students
  FOR UPDATE USING (auth.uid() = user_id);

-- Update read policy to match user_id instead of id (and allow admin reads)
DROP POLICY IF EXISTS "Allow users to read own student record" ON public.students;
DROP POLICY IF EXISTS "Allow public read of students" ON public.students;
CREATE POLICY "Allow users to read own student record" ON public.students
  FOR SELECT USING (
    auth.uid() = user_id OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
