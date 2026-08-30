-- ==============================================================================
-- MockS Database Migration: Create/Update public_feed Table with Bilingual Support
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public_feed (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,               -- 'EXAM_UPDATES', 'STRATEGY', 'CURRENT_AFFAIRS'
  title TEXT NOT NULL,                  -- English title
  title_hi TEXT,                        -- Hindi title
  summary TEXT NOT NULL,                -- English summary
  summary_hi TEXT,                      -- Hindi summary
  target_exam TEXT DEFAULT 'All',       -- 'MPPSC', 'JEE Main', 'NEET UG', 'SSC CGL', etc.
  official_pdf_url TEXT,                -- Direct official notification link / PDF
  source_portal TEXT,                   -- 'mppsc.mp.gov.in', 'ssc.gov.in', 'NTA'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add bilingual columns if table already existed without them
ALTER TABLE public_feed ADD COLUMN IF NOT EXISTS title_hi TEXT;
ALTER TABLE public_feed ADD COLUMN IF NOT EXISTS summary_hi TEXT;
ALTER TABLE public_feed ADD COLUMN IF NOT EXISTS source_portal TEXT;

-- Create indices for fast feed queries and category filtering
CREATE INDEX IF NOT EXISTS idx_public_feed_category ON public_feed(category);
CREATE INDEX IF NOT EXISTS idx_public_feed_target_exam ON public_feed(target_exam);
CREATE INDEX IF NOT EXISTS idx_public_feed_created_at ON public_feed(created_at DESC);

-- Enable public read access (Row Level Security)
ALTER TABLE public_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to public_feed"
  ON public_feed FOR SELECT
  USING (true);

CREATE POLICY "Allow admin/anon upsert to public_feed"
  ON public_feed FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow admin/anon update to public_feed"
  ON public_feed FOR UPDATE
  USING (true);
