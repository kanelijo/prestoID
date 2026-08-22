-- SQL Schema for the ZenZa Scraper "Content Lake"
-- Run this in your NEW Supabase project's SQL Editor

CREATE TABLE scraped_exam_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE, -- e.g., 'Engineering', 'Medical', 'Central Govt'
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE scraped_exams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES scraped_exam_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., 'JEE Main', 'UPSC Prelims'
    eligibility_criteria TEXT,
    exam_duration_minutes INTEGER,
    official_syllabus_json JSONB,
    source_url TEXT,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE scraped_questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    exam_id UUID REFERENCES scraped_exams(id) ON DELETE CASCADE,
    topic_name TEXT, -- e.g., 'Physics', 'History'
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_option_index INTEGER NOT NULL,
    explanation TEXT,
    source_pdf_file_id TEXT, -- Telegram File ID for unlimited storage
    sha256_hash TEXT UNIQUE NOT NULL, -- Deduplication hash to prevent identical questions
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security) - Allow public read access (since app only reads)
ALTER TABLE scraped_exam_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on scraped_categories" ON scraped_exam_categories FOR SELECT USING (true);
CREATE POLICY "Allow public read access on scraped_exams" ON scraped_exams FOR SELECT USING (true);
CREATE POLICY "Allow public read access on scraped_questions" ON scraped_questions FOR SELECT USING (true);
