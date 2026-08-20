-- ============================================================================
-- ZenZa Security & Bulk Student Import Migration
-- Run this in your Supabase Dashboard SQL Editor
-- ============================================================================

-- 1. Create or Replace Secure Test Submission RPC Function
CREATE OR REPLACE FUNCTION public.submit_test_answers(
    p_test_id UUID,
    p_student_id UUID,
    p_answers JSONB,
    p_time_logs JSONB DEFAULT '{}'::jsonb,
    p_exit_logs JSONB DEFAULT '[]'::jsonb
)
RETURNS TABLE (
    submission_id UUID,
    final_score INT,
    total_q INT,
    correct_cnt INT,
    wrong_cnt INT,
    skipped_cnt INT,
    student_rank INT
) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_pos_marks INT := 5;
    v_neg_marks INT := 0;
    v_total_questions INT := 0;
    v_correct_count INT := 0;
    v_wrong_count INT := 0;
    v_skipped_count INT := 0;
    v_score INT := 0;
    v_sub_id UUID;
    v_rank INT := 1;
    q_rec RECORD;
    student_ans TEXT;
BEGIN
    -- Fetch positive & negative marking rules for this test (default +5, -0)
    SELECT COALESCE(positive_marks, 5), COALESCE(negative_marks, 0)
    INTO v_pos_marks, v_neg_marks
    FROM public.tests
    WHERE id = p_test_id;

    -- Count total questions in test
    SELECT COUNT(*) INTO v_total_questions
    FROM public.test_questions
    WHERE test_id = p_test_id;

    -- Grade answers securely on server against secret correct_option
    FOR q_rec IN SELECT id, correct_option FROM public.test_questions WHERE test_id = p_test_id LOOP
        student_ans := p_answers->>q_rec.id::text;
        
        IF student_ans IS NULL OR student_ans = '' THEN
            v_skipped_count := v_skipped_count + 1;
        ELSIF student_ans = q_rec.correct_option THEN
            v_correct_count := v_correct_count + 1;
            v_score := v_score + v_pos_marks;
        ELSE
            v_wrong_count := v_wrong_count + 1;
            v_score := v_score - v_neg_marks;
        END IF;
    END LOOP;

    -- Upsert submission row in test_submissions
    INSERT INTO public.test_submissions (
        test_id,
        student_id,
        answers,
        time_logs,
        exit_logs,
        score,
        total_questions,
        submitted_at
    )
    VALUES (
        p_test_id,
        p_student_id,
        p_answers,
        p_time_logs,
        p_exit_logs,
        v_score,
        v_total_questions,
        NOW()
    )
    ON CONFLICT (test_id, student_id)
    DO UPDATE SET
        answers = EXCLUDED.answers,
        time_logs = EXCLUDED.time_logs,
        exit_logs = EXCLUDED.exit_logs,
        score = v_score,
        total_questions = v_total_questions,
        submitted_at = NOW()
    RETURNING id INTO v_sub_id;

    -- Compute student rank for this test
    SELECT sub_rank INTO v_rank FROM (
        SELECT id, RANK() OVER (ORDER BY score DESC, submitted_at ASC) as sub_rank
        FROM public.test_submissions
        WHERE test_id = p_test_id
    ) ranked
    WHERE ranked.id = v_sub_id;

    RETURN QUERY SELECT 
        v_sub_id, 
        v_score, 
        v_total_questions, 
        v_correct_count, 
        v_wrong_count, 
        v_skipped_count, 
        COALESCE(v_rank, 1);
END;
$$;

-- 2. Ensure RLS on test_submissions permits authenticated users to invoke RPC & read submissions
ALTER TABLE public.test_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read test_submissions" ON public.test_submissions;
CREATE POLICY "Allow users to read test_submissions" ON public.test_submissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow users to submit tests" ON public.test_submissions;
CREATE POLICY "Allow users to submit tests" ON public.test_submissions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow users to update tests" ON public.test_submissions;
CREATE POLICY "Allow users to update tests" ON public.test_submissions FOR UPDATE USING (true);

-- 3. Ensure students table has all fields required for Bulk Import
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_name TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS parent_phone TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS aadhaar_number TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS course TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS duration TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS fee_cycle TEXT DEFAULT 'monthly';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS fee_due_date TEXT DEFAULT '15';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS fee_amount TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS validity_period TEXT DEFAULT '1 Year';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS unique_passcode TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS secret_code TEXT;

