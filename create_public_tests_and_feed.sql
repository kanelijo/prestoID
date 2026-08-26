-- ============================================================================
-- ZenZa Public Environment & Open Practice Database Schema Migration
-- Run this in your Supabase Dashboard SQL Editor
-- ============================================================================

-- 1. Add is_public flag to tests table
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS exam_category TEXT DEFAULT 'MPPSC';
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS difficulty_level TEXT DEFAULT 'Medium';

-- 2. Add extended profile fields for Public Students
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS target_exam TEXT DEFAULT 'MPPSC';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS category_type TEXT DEFAULT 'Government Exams';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS academic_info JSONB DEFAULT '{}'::jsonb;

-- 3. Create public_feed table for Vacancy Alerts & Strategy Articles
CREATE TABLE IF NOT EXISTS public.public_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('VACANCY', 'STRATEGY', 'CURRENT_AFFAIRS')),
    summary TEXT NOT NULL,
    full_content TEXT,
    official_pdf_url TEXT,
    apply_link TEXT,
    target_exam TEXT DEFAULT 'ALL',
    views_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on public_feed
ALTER TABLE public.public_feed ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on public_feed" ON public.public_feed;
CREATE POLICY "Allow public read on public_feed" ON public.public_feed FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow admin write on public_feed" ON public.public_feed;
CREATE POLICY "Allow admin write on public_feed" ON public.public_feed FOR ALL USING (true);

-- 4. Create exam_syllabi table for Interactive Topic Checklist
CREATE TABLE IF NOT EXISTS public.exam_syllabi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_code TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    topic_name TEXT NOT NULL,
    weightage_percent INT DEFAULT 10,
    order_index INT DEFAULT 1
);

-- Enable RLS on exam_syllabi
ALTER TABLE public.exam_syllabi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on exam_syllabi" ON public.exam_syllabi;
CREATE POLICY "Allow public read on exam_syllabi" ON public.exam_syllabi FOR SELECT USING (true);

-- 5. Seed initial Exam Syllabi Data for MPPSC & SSC
INSERT INTO public.exam_syllabi (exam_code, subject_name, topic_name, weightage_percent, order_index) VALUES
('MPPSC', 'History & Culture of MP', 'Major Dynasties & Freedom Movement in MP', 20, 1),
('MPPSC', 'History & Culture of MP', 'Major Tribes & Dialects of MP', 15, 2),
('MPPSC', 'Geography of MP', 'Rivers, Mountains & Forest Resources of MP', 25, 3),
('MPPSC', 'Economy of MP', 'Demographics, Census & Agriculture in MP', 15, 4),
('MPPSC', 'Indian Constitution', 'Constitutional Framework & MP High Court', 15, 5),
('SSC_CGL', 'Quantitative Aptitude', 'Percentage, Profit & Loss, Ratio', 25, 1),
('SSC_CGL', 'Quantitative Aptitude', 'Algebra & Geometry', 20, 2),
('SSC_CGL', 'Reasoning', 'Coding-Decoding & Analogies', 20, 3),
('SSC_CGL', 'English Language', 'Reading Comprehension & Grammar', 25, 4)
ON CONFLICT DO NOTHING;

-- 6. Seed initial Vacancy Feed Items
INSERT INTO public.public_feed (title, category, summary, target_exam) VALUES
('MPPSC State Services Notification 2026 Released', 'VACANCY', 'MPPSC has announced 180+ vacancies for State Administrative Services. Application starts next month.', 'MPPSC'),
('MP Police Constable Recruitment Update', 'VACANCY', 'MP ESB announces upcoming Physical Test schedule for Constable recruitment candidates.', 'MP ESB'),
('Top 10 Exam Strategies for MPPSC Prelims GS 1', 'STRATEGY', 'Master MP Geography and History with these essential revision notes and shortcut tricks.', 'MPPSC')
ON CONFLICT DO NOTHING;
