-- SQL Script to fix Row Level Security (RLS) policies for student claiming
-- Run this script in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard)

-- 1. Enable RLS on the students table (in case it wasn't enabled)
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing SELECT and UPDATE policies on students table
DROP POLICY IF EXISTS "Allow users to read own student record" ON public.students;
DROP POLICY IF EXISTS "Allow users to update own student record" ON public.students;

-- 3. Create updated SELECT policy
-- This allows authenticated students to search and read unregistered/unlinked records (user_id IS NULL)
-- so they can match their Secret Code or Aadhaar. Once claimed (user_id IS NOT NULL), only the owner and admins can read it.
CREATE POLICY "Allow users to read own student record" ON public.students
  FOR SELECT USING (
    auth.uid() = user_id OR 
    user_id IS NULL OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 4. Create updated UPDATE policy
-- This allows students to update a row ONLY IF it's currently unclaimed (user_id IS NULL)
-- AND forces the final update result to set the user_id to their own auth.uid() (WITH CHECK).
-- Once claimed, only the owner can update their own student record.
CREATE POLICY "Allow users to update own student record" ON public.students
  FOR UPDATE 
  USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id);
