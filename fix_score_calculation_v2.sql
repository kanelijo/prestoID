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
    v_questions JSONB;
    q_rec RECORD;
    student_ans TEXT;
BEGIN
    -- Fetch positive & negative marks, AND the questions array from JSONB
    SELECT 
        COALESCE(positive_marks, 5), 
        COALESCE(negative_marks, 0),
        questions
    INTO v_pos_marks, v_neg_marks, v_questions
    FROM public.tests
    WHERE id = p_test_id;

    -- Count total questions
    IF v_questions IS NOT NULL AND jsonb_typeof(v_questions) = 'array' THEN
        v_total_questions := jsonb_array_length(v_questions);
        
        -- Grade answers by iterating through the JSONB questions array
        FOR q_rec IN 
            SELECT 
                (elem->>'id')::text as q_id,
                (elem->>'correct_option')::text as correct_opt
            FROM jsonb_array_elements(v_questions) AS elem
        LOOP
            student_ans := p_answers->>q_rec.q_id;
            
            IF student_ans IS NULL OR student_ans = '' THEN
                v_skipped_count := v_skipped_count + 1;
            ELSIF student_ans = q_rec.correct_opt THEN
                v_correct_count := v_correct_count + 1;
                v_score := v_score + v_pos_marks;
            ELSE
                v_wrong_count := v_wrong_count + 1;
                v_score := v_score - v_neg_marks;
            END IF;
        END LOOP;
    ELSE
        -- Fallback to test_questions table if JSONB doesn't exist
        SELECT COUNT(*) INTO v_total_questions FROM public.test_questions WHERE test_id = p_test_id;
        
        FOR q_rec IN SELECT id::text as q_id, correct_option::text as correct_opt FROM public.test_questions WHERE test_id = p_test_id LOOP
            student_ans := p_answers->>q_rec.q_id;
            
            IF student_ans IS NULL OR student_ans = '' THEN
                v_skipped_count := v_skipped_count + 1;
            ELSIF student_ans = q_rec.correct_opt THEN
                v_correct_count := v_correct_count + 1;
                v_score := v_score + v_pos_marks;
            ELSE
                v_wrong_count := v_wrong_count + 1;
                v_score := v_score - v_neg_marks;
            END IF;
        END LOOP;
    END IF;

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
        v_rank;
END;
$$;

-- LEADERBOARD RPC
CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (
    student_id UUID,
    student_name TEXT,
    avatar_url TEXT,
    total_score BIGINT,
    tests_taken BIGINT
) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY 
    SELECT 
        s.id as student_id,
        s.name as student_name,
        ''::text as avatar_url,
        SUM(ts.score) as total_score,
        COUNT(ts.id) as tests_taken
    FROM public.test_submissions ts
    JOIN public.students s ON ts.student_id = s.id
    GROUP BY s.id, s.name
    ORDER BY total_score DESC, tests_taken DESC;
END;
$$;
