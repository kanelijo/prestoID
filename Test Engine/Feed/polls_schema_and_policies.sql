-- ==============================================================================
-- MockS Database Migration: Enable RLS Policies and Seed Initial Daily Polls
-- Run this in Supabase SQL Editor
-- ==============================================================================

-- 1. Enable RLS and Add Policies for public_polls
ALTER TABLE public.public_polls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read to public_polls" ON public.public_polls;
CREATE POLICY "Allow public read to public_polls"
  ON public.public_polls FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert to public_polls" ON public.public_polls;
CREATE POLICY "Allow insert to public_polls"
  ON public.public_polls FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update to public_polls" ON public.public_polls;
CREATE POLICY "Allow update to public_polls"
  ON public.public_polls FOR UPDATE
  USING (true);

-- 2. Policies for public_poll_votes
ALTER TABLE public.public_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read to public_poll_votes" ON public.public_poll_votes;
CREATE POLICY "Allow public read to public_poll_votes"
  ON public.public_poll_votes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert to public_poll_votes" ON public.public_poll_votes;
CREATE POLICY "Allow insert to public_poll_votes"
  ON public.public_poll_votes FOR INSERT
  WITH CHECK (true);

-- 3. Seed 5 Daily Real Exam-Targeted Polls (Filtered by Stream & Exam)
INSERT INTO public.public_polls (question, options, correct_index, votes, target_exam, category, is_active)
VALUES
(
  'भारतीय संविधान सभा के स्थायी अध्यक्ष कौन थे?',
  '["A) 👑 डॉ. राजेंद्र प्रसाद", "B) ❤️ जवाहरलाल नेहरू", "C) 🙏 सरदार पटेल", "D) 👍 बी. आर. अंबेडकर"]'::jsonb,
  0,
  '[45600, 3900, 1500, 11000]'::jsonb,
  'MPPSC',
  'CURRENT_AFFAIRS',
  true
),
(
  '‘काजीरंगा राष्ट्रीय उद्यान’ किस राज्य में स्थित है?',
  '["A) 👌 असम", "B) ❤️ मेघालय", "C) 🙏 अरुणाचल प्रदेश", "D) 👍 मणिपुर"]'::jsonb,
  0,
  '[38200, 4200, 2100, 1800]'::jsonb,
  'SSC',
  'CURRENT_AFFAIRS',
  true
),
(
  'ISRO recently successfully launched which oceanographic & climate study satellite under EOS series in August 2026?',
  '["A) 👑 EOS-08 (SSLV-D3)", "B) ❤️ Aditya-L1", "C) 🙏 NISAR Mission", "D) 👍 INSAT-3DS"]'::jsonb,
  0,
  '[34200, 5100, 3800, 2900]'::jsonb,
  'JEE Main',
  'CURRENT_AFFAIRS',
  true
),
(
  '‘भारत का नेपोलियन’ किसे कहा जाता है?',
  '["A) 👑 समुद्रगुप्त", "B) ❤️ चंद्रगुप्त मौर्य", "C) 🙏 अशोक", "D) 👍 हर्षवर्धन"]'::jsonb,
  0,
  '[52100, 6300, 4100, 2200]'::jsonb,
  'ALL',
  'CURRENT_AFFAIRS',
  true
),
(
  'Which cell organelle is known as the "Powerhouse of the Cell"?',
  '["A) 👑 Mitochondria", "B) ❤️ Ribosome", "C) 🙏 Golgi Apparatus", "D) 👍 Lysosome"]'::jsonb,
  0,
  '[61200, 4300, 2900, 3100]'::jsonb,
  'NEET',
  'CURRENT_AFFAIRS',
  true
);
