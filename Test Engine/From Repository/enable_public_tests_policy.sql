-- ==============================================================================
-- MockS Database Policy: Allow Public Insert/Read for public_tests & public_test_submissions
-- Run this in Supabase SQL Editor to allow public test attempts and live leaderboards
-- ==============================================================================

-- 1. Public Tests Table
ALTER TABLE public.public_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on public_tests" ON public.public_tests;
CREATE POLICY "Allow public read on public_tests"
  ON public.public_tests FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert on public_tests" ON public.public_tests;
CREATE POLICY "Allow insert on public_tests"
  ON public.public_tests FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on public_tests" ON public.public_tests;
CREATE POLICY "Allow update on public_tests"
  ON public.public_tests FOR UPDATE
  USING (true);

-- 2. Public Test Submissions Table (Leaderboard & Results)
ALTER TABLE public.public_test_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on public_test_submissions" ON public.public_test_submissions;
CREATE POLICY "Allow public read on public_test_submissions"
  ON public.public_test_submissions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert on public_test_submissions" ON public.public_test_submissions;
CREATE POLICY "Allow insert on public_test_submissions"
  ON public.public_test_submissions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on public_test_submissions" ON public.public_test_submissions;
CREATE POLICY "Allow update on public_test_submissions"
  ON public.public_test_submissions FOR UPDATE
  USING (true);

-- 3. Test Questions Table (if used)
ALTER TABLE public.test_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on test_questions" ON public.test_questions;
CREATE POLICY "Allow public read on test_questions"
  ON public.test_questions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert on test_questions" ON public.test_questions;
CREATE POLICY "Allow insert on test_questions"
  ON public.test_questions FOR INSERT
  WITH CHECK (true);
