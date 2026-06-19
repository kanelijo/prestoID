-- SQL Patch to fix multi-coaching profile constraint
-- Run this script in your Supabase Dashboard SQL Editor

-- 1. Drop the unique constraint on user_id so a student can claim multiple profiles
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_user_id_key;

-- 2. Add a unique constraint on user_id + institute_id so a student can only claim ONE profile PER coaching center
ALTER TABLE public.students ADD CONSTRAINT students_user_institute_key UNIQUE (user_id, institute_id);

-- 3. CREATE CLAIM REQUESTS TABLE FOR AADHAAR BASED CLAIMS
CREATE TABLE IF NOT EXISTS public.claim_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.claim_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public insert of claim requests" ON public.claim_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow users to read own requests" ON public.claim_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow admins to manage requests" ON public.claim_requests FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.institutes i 
    JOIN public.students s ON s.institute_id = i.id 
    WHERE s.id = claim_requests.student_id AND i.admin_id = auth.uid()
  )
);
