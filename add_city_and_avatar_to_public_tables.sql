-- ============================================================================
-- PRESTOID / MOCKS: ADD CITY AND PROFILE ENHANCEMENTS FOR PUBLIC TABLES
-- ============================================================================

-- 1. Add city column to public_students
ALTER TABLE public.public_students 
ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Indore';

-- 2. Add avatar_url, state, and city columns to public_test_submissions
ALTER TABLE public.public_test_submissions 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE public.public_test_submissions 
ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'Madhya Pradesh';

ALTER TABLE public.public_test_submissions 
ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Indore';

-- 3. Add city column to profiles table if missing
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Indore';

-- 4. Index for fast leaderboard queries with city and state filtering
CREATE INDEX IF NOT EXISTS idx_public_test_subs_score_exam 
ON public.public_test_submissions(score DESC);

CREATE INDEX IF NOT EXISTS idx_public_students_state_city 
ON public.public_students(state, city);
