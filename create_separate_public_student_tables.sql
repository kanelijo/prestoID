-- ============================================================================
-- PRESTOID / ZENZA: STRICT DATABASE SEPARATION
-- 1. Private Coaching Students vs 2. Public Independent Students
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PUBLIC STUDENTS TABLE (Totally separate from coaching institute students)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    name TEXT NOT NULL DEFAULT 'Public Aspirant',
    email TEXT,
    phone TEXT,
    target_exam TEXT DEFAULT 'MPPSC',
    state TEXT DEFAULT 'Madhya Pradesh',
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on public_students
ALTER TABLE public.public_students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public students viewable by everyone" ON public.public_students;
CREATE POLICY "Public students viewable by everyone" ON public.public_students FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public students can insert their own profile" ON public.public_students;
CREATE POLICY "Public students can insert their own profile" ON public.public_students FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public students can update their own profile" ON public.public_students;
CREATE POLICY "Public students can update their own profile" ON public.public_students FOR UPDATE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2. PUBLIC TESTS TABLE (Open tests available to all independent candidates)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    exam_category TEXT NOT NULL DEFAULT 'MPPSC',
    subject_name TEXT DEFAULT 'General Studies',
    duration_minutes INT DEFAULT 60,
    total_marks INT DEFAULT 100,
    questions_count INT DEFAULT 50,
    difficulty_level TEXT DEFAULT 'Medium' CHECK (difficulty_level IN ('Easy', 'Medium', 'Hard')),
    questions JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on public_tests
ALTER TABLE public.public_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on public_tests" ON public.public_tests;
CREATE POLICY "Allow public read on public_tests" ON public.public_tests FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- 3. PUBLIC TEST SUBMISSIONS TABLE (Public candidates exam submissions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_test_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID REFERENCES public.public_tests(id) ON DELETE CASCADE,
    public_student_id UUID REFERENCES public.public_students(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    student_name TEXT DEFAULT 'Public Aspirant',
    score NUMERIC DEFAULT 0,
    total_marks NUMERIC DEFAULT 100,
    accuracy_percent NUMERIC DEFAULT 0,
    time_taken_seconds INT DEFAULT 0,
    submitted_answers JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on public_test_submissions
ALTER TABLE public.public_test_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on public_test_submissions" ON public.public_test_submissions;
CREATE POLICY "Allow public read on public_test_submissions" ON public.public_test_submissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert on public_test_submissions" ON public.public_test_submissions;
CREATE POLICY "Allow authenticated insert on public_test_submissions" ON public.public_test_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. SEED SAMPLE PUBLIC TESTS (MPPSC, MP Police, SSC CGL)
-- ----------------------------------------------------------------------------
INSERT INTO public.public_tests (title, description, exam_category, subject_name, duration_minutes, total_marks, questions_count, difficulty_level)
VALUES 
('MPPSC Prelims Paper 1 — Full Length Mock 2026', 'Comprehensive 100 question mock test covering MP GK, Indian Polity, History, and Geography according to latest syllabus.', 'MPPSC', 'General Studies', 120, 200, 100, 'Medium'),
('MP Police Constable & SI — Reasoning & Math Speed Drill', 'High-yield numerical ability, non-verbal reasoning, and state aptitude practice.', 'MP Police (SI/Constable)', 'Aptitude & Reasoning', 45, 50, 50, 'Easy'),
('SSC CGL 2026 Tier-1 — General Awareness Master Drill', 'Curated MCQs on Indian Economy, Ancient & Modern History, Science & Current Affairs.', 'SSC CGL', 'General Awareness', 30, 50, 25, 'Hard'),
('Railway NTPC & Group D — General Science Practice', 'High-frequency Physics, Chemistry, and Biology questions with bilingual explanations.', 'Railway', 'General Science', 40, 60, 40, 'Medium')
ON CONFLICT DO NOTHING;
