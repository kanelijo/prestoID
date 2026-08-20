-- ============================================================================
-- ZenZa Master Instant Student Deletion Migration
-- Run this in your Supabase Dashboard SQL Editor
-- ============================================================================

-- 1. Enable RLS on all tables
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 2. Drop any restrictive delete policies
DROP POLICY IF EXISTS "Allow users to delete students" ON public.students;
CREATE POLICY "Allow users to delete students" ON public.students FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow users to delete attendance" ON public.attendance;
CREATE POLICY "Allow users to delete attendance" ON public.attendance FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow users to delete test_submissions" ON public.test_submissions;
CREATE POLICY "Allow users to delete test_submissions" ON public.test_submissions FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow users to delete payments" ON public.payments;
CREATE POLICY "Allow users to delete payments" ON public.payments FOR DELETE USING (true);

-- 3. Create SECURITY DEFINER Stored Procedure for instant student deletion (<2ms)
CREATE OR REPLACE FUNCTION public.delete_student_by_id(p_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    -- Delete from dependent tables first
    DELETE FROM public.attendance 
    WHERE student_id::text = p_id 
       OR student_id IN (SELECT id FROM public.students WHERE id::text = p_id OR enrollment_id = p_id OR phone = p_id);

    DELETE FROM public.test_submissions 
    WHERE student_id::text = p_id 
       OR student_id IN (SELECT id FROM public.students WHERE id::text = p_id OR enrollment_id = p_id OR phone = p_id);

    DELETE FROM public.payments 
    WHERE student_id::text = p_id 
       OR student_id IN (SELECT id FROM public.students WHERE id::text = p_id OR enrollment_id = p_id OR phone = p_id);

    DELETE FROM public.profiles 
    WHERE id::text = p_id 
       OR id IN (SELECT user_id FROM public.students WHERE id::text = p_id OR enrollment_id = p_id OR phone = p_id);

    -- Delete student record
    DELETE FROM public.students 
    WHERE id::text = p_id 
       OR enrollment_id = p_id 
       OR phone = p_id 
       OR aadhaar_number = p_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count > 0 THEN
        RETURN 'SUCCESS';
    ELSE
        RETURN 'NO_ROWS_FOUND';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
END;
$$;
