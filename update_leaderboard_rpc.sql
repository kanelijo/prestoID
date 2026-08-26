-- Update Leaderboard RPC to support 'all', 'live', and 'local' modes
CREATE OR REPLACE FUNCTION public.get_leaderboard(p_mode TEXT DEFAULT 'all')
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
        COALESCE(s.photo_url, '') as avatar_url,
        (COALESCE(SUM(ts.score), 0) + COUNT(ts.id))::BIGINT as total_score,
        COUNT(ts.id) as tests_taken
    FROM public.test_submissions ts
    JOIN public.students s ON ts.student_id = s.id
    JOIN public.tests t ON ts.test_id = t.id
    WHERE 
        (p_mode = 'all') OR
        (p_mode = 'live' AND (t.description IS NULL OR t.description NOT LIKE 'AI_Practice_Test:%')) OR
        (p_mode = 'local' AND t.description LIKE 'AI_Practice_Test:%')
    GROUP BY s.id, s.name, s.photo_url
    ORDER BY total_score DESC, tests_taken DESC;
END;
$$;
