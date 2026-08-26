-- Phase 5: AI Test Engine Schema

-- Test Banks: Repository of materials uploaded by teachers
CREATE TABLE test_banks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    file_url TEXT, -- Link to uploaded PDF/Image in Supabase Storage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tests: Scheduled exams
CREATE TABLE tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    target_batches TEXT[] NOT NULL, -- Array of batch names e.g., ['MPPSC', 'UPSC']
    title TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Test Questions: MCQs belonging to a test
CREATE TABLE test_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
    explanation TEXT,
    topic_tag TEXT,
    order_index INTEGER NOT NULL DEFAULT 0
);

-- Test Submissions: Student answers and results
CREATE TABLE test_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g., {"q1_uuid": "A", "q2_uuid": "C"}
    score INTEGER,
    total_questions INTEGER,
    exit_logs JSONB DEFAULT '[]'::jsonb, -- Array of { time, type: 'app_switch' | 'connection_lost' }
    is_offline_submission BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(test_id, student_id) -- A student can only take a test once
);

-- RLS Policies
ALTER TABLE test_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_submissions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read for now (demo mode MVP)
CREATE POLICY "Enable read access for all users" ON test_banks FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON tests FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON test_questions FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON test_submissions FOR SELECT USING (true);

-- Allow inserts/updates
CREATE POLICY "Enable insert for authenticated users only" ON test_banks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Enable insert for authenticated users only" ON tests FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Enable insert for authenticated users only" ON test_questions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Enable insert for all users" ON test_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON tests FOR UPDATE USING (true);
CREATE POLICY "Enable update for all users" ON test_submissions FOR UPDATE USING (true);
CREATE POLICY "Enable update for all users" ON test_questions FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON test_questions FOR DELETE USING (true);
