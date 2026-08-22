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
        SUM(ts.score)::BIGINT as total_score,
        COUNT(ts.id) as tests_taken
    FROM public.test_submissions ts
    JOIN public.students s ON ts.student_id = s.id
    GROUP BY s.id, s.name
    ORDER BY total_score DESC, tests_taken DESC;
END;
$$;
